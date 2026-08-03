import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, createConnection } from 'node:net';
import { TLSSocket, connect as connectTls } from 'node:tls';

import {
  EmailProvider,
  ProviderDeliveryResult,
  SendEmailInput,
} from '../contracts/email-provider';

type SmtpResponse = { code: number; lines: string[] };

class SmtpSession {
  private buffer = '';
  private readonly responses: SmtpResponse[] = [];
  private readonly waiters: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private currentCode?: number;
  private currentLines: string[] = [];
  private readonly onData = (chunk: Buffer) => this.accept(chunk.toString('utf8'));
  private readonly onError = (error: Error) => this.fail(error);
  private readonly onClose = () => this.fail(new Error('SMTP connection closed unexpectedly.'));

  constructor(readonly socket: Socket | TLSSocket) {
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
    socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP operation timed out.')));
  }

  detach(): void {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
  }

  async command(command: string, expected: number | number[]): Promise<SmtpResponse> {
    this.socket.write(`${command}\r\n`);
    const response = await this.next();
    const accepted = Array.isArray(expected) ? expected : [expected];
    if (!accepted.includes(response.code)) {
      throw new Error(
        `SMTP command failed with ${response.code}: ${response.lines.join(' ')}`.slice(0, 1_000),
      );
    }
    return response;
  }

  next(): Promise<SmtpResponse> {
    const queued = this.responses.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private accept(chunk: string): void {
    this.buffer += chunk;
    let boundary = this.buffer.indexOf('\r\n');
    while (boundary >= 0) {
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (match) {
        const code = Number(match[1]);
        this.currentCode ??= code;
        this.currentLines.push(match[3]);
        if (match[2] === ' ') {
          this.push({ code: this.currentCode, lines: this.currentLines });
          this.currentCode = undefined;
          this.currentLines = [];
        }
      }
      boundary = this.buffer.indexOf('\r\n');
    }
  }

  private push(response: SmtpResponse): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(response);
    else this.responses.push(response);
  }

  private fail(error: Error): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';

  constructor(private readonly config: ConfigService) {}

  async send(input: SendEmailInput): Promise<ProviderDeliveryResult> {
    const host = this.config.getOrThrow<string>('app.smtpHost');
    const port = this.config.get<number>('app.smtpPort', 587);
    const secure = this.config.get<boolean>('app.smtpSecure', false);
    const rejectUnauthorized = !this.config.get<boolean>(
      'app.smtpAllowInvalidCertificates',
      false,
    );
    let socket: Socket | TLSSocket = secure
      ? await this.openTls(host, port, rejectUnauthorized)
      : await this.openPlain(host, port);
    let session = new SmtpSession(socket);

    try {
      this.expect(await session.next(), 220);
      let capabilities = await session.command(`EHLO ${this.hostname()}`, 250);
      if (!secure) {
        if (!capabilities.lines.some((line) => line.toUpperCase().includes('STARTTLS'))) {
          throw new Error('SMTP server does not offer STARTTLS.');
        }
        await session.command('STARTTLS', 220);
        session.detach();
        socket = await this.upgradeTls(socket, host, rejectUnauthorized);
        session = new SmtpSession(socket);
        capabilities = await session.command(`EHLO ${this.hostname()}`, 250);
      }

      const username = this.config.get<string>('app.smtpUsername');
      const password = this.config.get<string>('app.smtpPassword');
      if (username && password) {
        if (!capabilities.lines.some((line) => line.toUpperCase().includes('AUTH'))) {
          throw new Error('SMTP server does not advertise authentication.');
        }
        const credentials = Buffer.from(`\0${username}\0${password}`).toString('base64');
        await session.command(`AUTH PLAIN ${credentials}`, 235);
      }

      const from = this.config.getOrThrow<string>('app.smtpFrom');
      await session.command(`MAIL FROM:<${this.address(from)}>`, 250);
      await session.command(`RCPT TO:<${this.address(input.to)}>`, [250, 251]);
      await session.command('DATA', 354);
      socket.write(`${this.message(from, input)}\r\n.\r\n`);
      const accepted = await session.next();
      this.expect(accepted, 250);
      await session.command('QUIT', 221);
      return {
        messageId:
          /(?:queued as|id[=:\s]+)([A-Za-z0-9._-]+)/i.exec(accepted.lines.join(' '))?.[1] ??
          `smtp-${Date.now()}`,
      };
    } finally {
      session.detach();
      socket.end();
    }
  }

  private message(from: string, input: SendEmailInput): string {
    const subject = this.cleanHeader(input.subject);
    const content = input.html ?? input.text;
    const type = input.html ? 'text/html' : 'text/plain';
    return [
      `From: ${this.cleanHeader(from)}`,
      `To: ${this.cleanHeader(input.to)}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: ${type}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(content).toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd(),
    ].join('\r\n');
  }

  private openPlain(host: string, port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  private openTls(host: string, port: number, rejectUnauthorized: boolean): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const socket = connectTls({ host, port, servername: host, rejectUnauthorized });
      socket.once('secureConnect', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  private upgradeTls(
    socket: Socket | TLSSocket,
    host: string,
    rejectUnauthorized: boolean,
  ): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const secure = connectTls({ socket, servername: host, rejectUnauthorized });
      secure.once('secureConnect', () => resolve(secure));
      secure.once('error', reject);
    });
  }

  private expect(response: SmtpResponse, expected: number): void {
    if (response.code !== expected) {
      throw new Error(`SMTP expected ${expected}, received ${response.code}.`);
    }
  }

  private address(value: string): string {
    const match = /<([^>]+)>/.exec(value);
    const address = (match?.[1] ?? value).trim();
    if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) throw new Error('Invalid SMTP email address.');
    return address;
  }

  private cleanHeader(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
  }

  private hostname(): string {
    return this.config.get<string>('app.smtpEhloName', 'silver-gallery.local');
  }
}
