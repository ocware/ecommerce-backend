import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { AddWishlistItemDto } from '../dto/add-wishlist-item.dto';
import { CreateProductReviewDto } from '../dto/create-product-review.dto';
import { SubscribeStockDto } from '../dto/subscribe-stock.dto';
import { EngagementService } from '../services/engagement.service';

@ApiTags('store engagement')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller({ path: 'store', version: '1' })
export class StoreEngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post('products/:slug/reviews')
  createReview(
    @Param('slug') slug: string,
    @Body() dto: CreateProductReviewDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.createReview(slug, dto, customer);
  }

  @Get('products/:slug/reviews/eligibility')
  reviewEligibility(
    @Param('slug') slug: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.reviewEligibility(slug, customer.id);
  }

  @Get('customers/me/wishlist')
  wishlist(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.engagement.listWishlist(customer.id);
  }

  @Get('customers/me/wishlist/check/:productId')
  checkWishlist(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.checkWishlist(customer.id, productId);
  }

  @Post('customers/me/wishlist')
  addWishlist(
    @Body() dto: AddWishlistItemDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.addWishlist(customer.id, dto.productId);
  }

  @Delete('customers/me/wishlist/:productId')
  removeWishlist(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.removeWishlist(customer.id, productId);
  }

  @Post('customers/me/stock-subscriptions')
  subscribeStock(
    @Body() dto: SubscribeStockDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.subscribeStock(customer.id, dto.variantId);
  }

  @Delete('customers/me/stock-subscriptions/:variantId')
  unsubscribeStock(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.unsubscribeStock(customer.id, variantId);
  }

  @Get('customers/me/notifications')
  notifications(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.engagement.listNotifications(customer.id);
  }

  @Patch('customers/me/notifications/read-all')
  markAllRead(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.engagement.markAllNotificationsRead(customer.id);
  }

  @Patch('customers/me/notifications/:id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.engagement.markNotificationRead(id, customer.id);
  }
}
