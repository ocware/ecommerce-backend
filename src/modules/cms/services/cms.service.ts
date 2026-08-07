import { Injectable, NotFoundException } from '@nestjs/common';
import { CmsPageStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  HomePromoTileDto,
  HomeTestimonialDto,
  UpdateHomeContentDto,
} from '../dto/update-home-content.dto';
import { UpsertContentPageDto } from '../dto/upsert-content-page.dto';
import { UpsertHomeSlideDto } from '../dto/upsert-home-slide.dto';

const homeId = 'default';
const homeInclude = { slides: { orderBy: { position: 'asc' as const } } };

const defaultPromoTiles: HomePromoTileDto[] = [
  {
    title: 'ارسال رایگان',
    body: 'برای سفارش‌های بالای ۸۰۰ هزار تومان',
    cta: 'شروع خرید',
    linkUrl: '/shop',
    imageUrl: '/images/categories/gift-sets.jpg',
  },
  {
    title: 'کالکشن جدید',
    body: 'جدیدترین انگشترهای نگین‌دار',
    cta: 'مشاهده کالکشن',
    linkUrl: '/shop/c/gemstone-rings',
    imageUrl: '/images/categories/gemstone-rings.jpg',
  },
];

const defaultTestimonials: HomeTestimonialDto[] = [
  {
    name: 'مریم احمدی',
    city: 'تهران',
    quote:
      'انگشتر نقره‌ام فوق‌العاده بود. کیفیت ساخت و بسته‌بندی خیلی شیک بود.',
  },
  {
    name: 'علی رضایی',
    city: 'اصفهان',
    quote: 'برای هدیه سالگرد سفارش دادم؛ به‌موقع رسید و بسیار زیبا بود.',
  },
  {
    name: 'زهرا کریمی',
    city: 'شیراز',
    quote: 'طراحی حلقه‌هایشان بی‌نظیر است. حتماً دوباره خرید می‌کنم.',
  },
  {
    name: 'حسین محمدی',
    city: 'مشهد',
    quote: 'اصالت نقره و عیار کاملاً مشخص بود. کیفیت عالی.',
  },
];

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
    if (dto.featuredProductIds !== undefined) {
      await this.requireAllProducts(dto.featuredProductIds);
    }
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
        promoImageUrl:
          dto.promoImageUrl === undefined
            ? undefined
            : dto.promoImageUrl.trim() || null,
        promoTiles:
          dto.promoTiles === undefined
            ? undefined
            : (this.normalizePromoTiles(
                dto.promoTiles,
              ) as Prisma.InputJsonValue),
        testimonials:
          dto.testimonials === undefined
            ? undefined
            : (this.normalizeTestimonials(
                dto.testimonials,
              ) as Prisma.InputJsonValue),
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
        promoTiles: defaultPromoTiles as unknown as Prisma.InputJsonValue,
        testimonials: defaultTestimonials as unknown as Prisma.InputJsonValue,
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

  private async requireAllProducts(ids: string[]) {
    if (ids.length === 0) return;
    const uniqueIds = [...new Set(ids)];
    const count = await this.prisma.product.count({
      where: { id: { in: uniqueIds } },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'One or more featured products were not found.',
      });
    }
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

  private normalizePromoTiles(tiles: HomePromoTileDto[]) {
    return tiles.map((tile) => ({
      title: tile.title.trim(),
      body: tile.body.trim(),
      cta: tile.cta.trim(),
      linkUrl: tile.linkUrl.trim(),
      imageUrl: tile.imageUrl.trim(),
    }));
  }

  private normalizeTestimonials(items: HomeTestimonialDto[]) {
    return items.map((item) => ({
      name: item.name.trim(),
      city: item.city.trim(),
      quote: item.quote.trim(),
    }));
  }

  private parsePromoTiles(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) return [] as ReturnType<CmsService['normalizePromoTiles']>;
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : '';
      const body = typeof record.body === 'string' ? record.body : '';
      const cta = typeof record.cta === 'string' ? record.cta : '';
      const linkUrl = typeof record.linkUrl === 'string' ? record.linkUrl : '';
      const imageUrl =
        typeof record.imageUrl === 'string' ? record.imageUrl : '';
      if (!title || !cta || !linkUrl || !imageUrl) return [];
      return [{ title, body, cta, linkUrl, imageUrl }];
    });
  }

  private parseTestimonials(value: Prisma.JsonValue) {
    if (!Array.isArray(value))
      return [] as ReturnType<CmsService['normalizeTestimonials']>;
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name : '';
      const city = typeof record.city === 'string' ? record.city : '';
      const quote = typeof record.quote === 'string' ? record.quote : '';
      if (!name || !city || !quote) return [];
      return [{ name, city, quote }];
    });
  }

  private serializeHome(
    home: {
      heroTitle: string;
      heroSubtitle: string | null;
      featuredProductIds: Prisma.JsonValue;
      featuredCategorySlugs: Prisma.JsonValue;
      promoTitle: string | null;
      promoBody: string | null;
      promoLinkUrl: string | null;
      promoImageUrl: string | null;
      promoTiles: Prisma.JsonValue;
      testimonials: Prisma.JsonValue;
      updatedAt: Date;
      slides: Array<{
        id: string;
        title: string;
        subtitle: string | null;
        imageUrl: string;
        linkUrl: string | null;
        position: number;
        isActive: boolean;
      }>;
    },
    publicOnly: boolean,
  ) {
    const promoTiles = this.parsePromoTiles(home.promoTiles);
    const testimonials = this.parseTestimonials(home.testimonials);
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
            image_url: home.promoImageUrl,
          }
        : undefined,
      promo_tiles: promoTiles.map((tile) => ({
        title: tile.title,
        body: tile.body,
        cta: tile.cta,
        link_url: tile.linkUrl,
        image_url: tile.imageUrl,
      })),
      testimonials,
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
