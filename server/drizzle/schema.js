import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  username: text('username'),
  avatarUrl: text('avatar_url'),
  tenantId: integer('tenant_id').default(0),
  points: integer('points').default(0),
  createdAt: text('created_at'),
  uid: text('uid'),
  inviteCode: text('invite_code'),
  virtualCurrency: integer('virtual_currency').default(0),
  invitationPoints: integer('invitation_points').default(0),
  freePostsCount: integer('free_posts_count').default(0),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().default(0),
  authorId: text('author_id').notNull(),
  content: text('content'),
  images: text('images'),
  isAd: integer('is_ad').default(0),
  isPinned: integer('is_pinned').default(0),
  status: text('status').default('approved'),
  rejectionReason: text('rejection_reason'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull(),
  userId: text('user_id').notNull(),
  content: text('content'),
  createdAt: text('created_at')
});

export const likes = sqliteTable('likes', {
  postId: integer('post_id').notNull(),
  userId: text('user_id').notNull()
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  content: text('content'),
  isRead: integer('is_read').default(0),
  createdAt: text('created_at')
});

export const appSettings = sqliteTable('app_settings', {
  tenantId: integer('tenant_id').notNull(),
  key: text('key').notNull(),
  value: text('value'),
  name: text('name'),
  description: text('description'),
  type: text('type')
});

export const pageContent = sqliteTable('page_content', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().default(0),
  page: text('page').notNull(),
  section: text('section').notNull(),
  position: integer('position').default(0),
  content: text('content')
});

export const tenantRequests = sqliteTable('tenant_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  desiredDomain: text('desired_domain'),
  userId: text('user_id'),
  contactWangWang: text('contact_wangwang'),
  status: text('status'),
  vercelProjectId: text('vercel_project_id'),
  vercelAssignedDomain: text('vercel_assigned_domain'),
  vercelDeploymentStatus: text('vercel_deployment_status'),
  createdAt: text('created_at'),
  rejectionReason: text('rejection_reason'),
  vercelSubdomainSlug: text('vercel_subdomain_slug'),
  fallbackDomain: text('fallback_domain'),
});

export const adminUsers = sqliteTable('admin_users', {
  userId: text('user_id').primaryKey()
});

export const tenantAdmins = sqliteTable('tenant_admins', {
  tenantId: integer('tenant_id').notNull(),
  userId: text('user_id').notNull()
});

export const branches = sqliteTable('branches', {
  tenantId: integer('tenant_id').primaryKey(),
  branchUrl: text('branch_url').notNull(),
  source: text('source'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at')
});

export const sharedPosts = sqliteTable('shared_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authorId: text('author_id').notNull(),
  content: text('content'),
  images: text('images'),
  isAd: integer('is_ad').default(0),
  isPinned: integer('is_pinned').default(0),
  status: text('status').default('approved'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

export const sharedComments = sqliteTable('shared_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull(),
  userId: text('user_id').notNull(),
  content: text('content'),
  createdAt: text('created_at')
});

export const sharedLikes = sqliteTable('shared_likes', {
  postId: integer('post_id').notNull(),
  userId: text('user_id').notNull()
});

export const sharedProfiles = sqliteTable('shared_profiles', {
  id: text('id').primaryKey(),
  username: text('username'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at'),
  uid: text('uid')
});

export const pointsHistory = sqliteTable('points_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  changeAmount: integer('change_amount').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('created_at')
});

export const shopProducts = sqliteTable('shop_products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().default(0),
  name: text('name'),
  description: text('description'),
  imageUrl: text('image_url'),
  price: integer('price').notNull().default(0),
  stock: integer('stock').notNull().default(-1),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at')
});

export const shopRedemptions = sqliteTable('shop_redemptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  productId: integer('product_id').notNull(),
  userId: text('user_id').notNull(),
  pointsSpent: integer('points_spent').notNull(),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  productName: text('product_name'),
  productImageUrl: text('product_image_url'),
  productPrice: integer('product_price'),
  createdAt: text('created_at')
});

export const invitations = sqliteTable('invitations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().default(0),
  inviteeId: text('invitee_id').notNull(),
  inviterId: text('inviter_id').notNull(),
  createdAt: text('created_at')
}); 