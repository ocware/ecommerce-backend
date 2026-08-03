import { Injectable, NotFoundException } from '@nestjs/common';
import { CmsPageStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { UpdateHomeContentDto } from '../dto/update-home-content.dto';
import { UpsertContentPageDto } from '../dto/upsert-content-page.dto';
import { UpsertHomeSlideDto } from '../dto/upsert-home-slide.dto';

const homeId = 'default';
const homeInclude = { slides: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicHome() {
    return this.serializeHome(await this.getHome(), true);
  }

  async getAdminHome() {
    return this.serializeHome(await this.getHome(), false);
  }

  async updateHome(dto: UpdateHomeContentDto, staffId: string) {
    await this.getHome();
    const updated = await this.prisma.cmsHome.update({
      where: { id: homeId },
      data: {
        heroTitle: dto.heroTitle?.trim(),
        heroSubtitle: dto.heroSubtitle?.trim(),
        featuredProductIds: dto.featuredProductIds,
        featuredCategorySlugs: dto.featuredCategorySlugs,
        promoTitle: dto.promoTitle?.trim(),
        promoBody: dto.promoBody?.trim(),
        promoLinkUrl: dto.promoLinkUrl?.trim(),
        updatedByStaffUserId: staffId,
      },
      include: homeInclude,
    });
    return this.serializeHome(updated, false);
  }

  async createSlide(dto: UpsertHomeSlideDto, staffId: string) {
    await this.getHome();
    const slide = await this.prisma.cmsHomeSlide.create({
      data: {
        homeId,
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim(),
        imageUrl: dto.imageUrl.trim(),
        linkUrl: dto.linkUrl?.trim(),
        position: dto.position,
        isActive: dto.isActive,
        updatedByStaffUserId: staffId,
      },
    });
    return this.serializeSlide(slide);
  }

  async updateSlide(id: string, dto: UpsertHomeSlideDto, staffId: string) {
    await this.requireSlide(id);
    const slide = await this.prisma.cmsHomeSlide.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim(),
        imageUrl: dto.imageUrl.trim(),
        linkUrl: dto.linkUrl?.trim(),
        position: dto.position,
        isActive: dto.isActive,
        updatedByStaffUserId: staffId,
      },
    });
    return this.serializeSlide(slide);
  }

  async deleteSlide(id: string) {
    await this.requireSlide(id);
    await this.prisma.cmsHomeSlide.delete({ where: { id } });
    return { ok: true };
  }

  async getPublicPage(slug: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { slug, status: CmsPageStatus.PUBLISHED },
    });
    if (!page) throw this.pageNotFound();
    return this.serializePage(page);
  }

  async listAdminPages() {
    const pages = await this.prisma.cmsPage.findMany({ orderBy: { slug: 'asc' } });
    return pages.map((page) => this.serializePage(page));
  }

  async getAdminPage(slug: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (!page) throw this.pageNotFound();
    return this.serializePage(page);
  }

  async upsertPage(slug: string, dto: UpsertContentPageDto, staffId: string) {
    const publishedAt =
      dto.status === CmsPageStatus.PUBLISHED ? new Date() : null;
    const page = await this.prisma.cmsPage.upsert({
      where: { slug },
      create: {
        slug,
        title: dto.title.trim(),
        bodyMarkdown: dto.bodyMarkdown.trim(),
        seoTitle: dto.seoTitle?.trim(),
        seoDescription: dto.seoDescription?.trim(),
        status: dto.status,
        publishedAt,
        updatedByStaffUserId: staffId,
      },
      update: {
        title: dto.title.trim(),
        bodyMarkdown: dto.bodyMarkdown.trim(),
        seoTitle: dto.seoTitle?.trim(),
        seoDescription: dto.seoDescription?.trim(),
        status: dto.status,
        publishedAt,
        updatedByStaffUserId: staffId,
      },
    });
    return this.serializePage(page);
  }

  private async getHome() {
    return this.prisma.cmsHome.upsert({
      where: { id: homeId },
      create: {
        id: homeId,
        heroTitle: 'گالری نقره',
        heroSubtitle: 'زیورآلات نقره اصیل با ضمانت عیار',
        featuredProductIds: [],
        featuredCategorySlugs: [],
      },
      update: {},
      include: homeInclude,
    });
  }

  private async requireSlide(id: string) {
    const slide = await this.prisma.cmsHomeSlide.findUnique({ where: { id } });
    if (!slide) {
      throw new NotFoundException({
        code: 'CMS_SLIDE_NOT_FOUND',
        message: 'The home slide was not found.',
      });
    }
    return slide;
  }

  private pageNotFound() {
    return new NotFoundException({
      code: 'CMS_PAGE_NOT_FOUND',
      message: 'The content page was not found.',
    });
  }

  private stringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private serializeHome(
    home: Awaited<ReturnType<CmsService['getHome']>>,
    publicOnly: boolean,
  ) {
    return {
      hero_title: home.heroTitle,
      hero_subtitle: home.heroSubtitle,
      featured_product_ids: this.stringArray(home.featuredProductIds),
      featured_category_slugs: this.stringArray(home.featuredCategorySlugs),
      slides: home.slides
        .filter((slide) => !publicOnly || slide.isActive)
        .map((slide) => this.serializeSlide(slide)),
      promo_banner: home.promoTitle
        ? {
            title: home.promoTitle,
            body: home.promoBody ?? '',
            link_url: home.promoLinkUrl,
          }
        : undefined,
      updated_at: home.updatedAt,
    };
  }

  private serializeSlide(slide: {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string;
    linkUrl: string | null;
    position: number;
    isActive: boolean;
  }) {
    return {
      id: slide.id,
      title: slide.title,
      subtitle: slide.subtitle,
      image_url: slide.imageUrl,
      link_url: slide.linkUrl,
      sort_order: slide.position,
      active: slide.isActive,
    };
  }

  private serializePage(page: {
    id: string;
    slug: string;
    title: string;
    bodyMarkdown: string;
    seoTitle: string | null;
    seoDescription: string | null;
    status: CmsPageStatus;
    publishedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      body_markdown: page.bodyMarkdown,
      seo_title: page.seoTitle,
      seo_description: page.seoDescription,
      status: page.status,
      published_at: page.publishedAt,
      updated_at: page.updatedAt,
    };
  }
}
