/**
 * 同步 Supabase 已验证用户到 Turso 数据库
 * 
 * 使用场景:
 * - Supabase Authentication 有用户，但 Turso profiles 表缺少对应记录
 * - 批量同步历史用户
 * 
 * 运行:
 * node tools/sync-supabase-users.js
 */

import { createClient } from '@supabase/supabase-js';
import { getGlobalDb, getGlobalClient } from '../server/tursoApi.js';
import { profiles } from '../server/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少必要的环境变量:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Supabase 管理客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function syncUsers() {
  console.log('🔄 开始同步 Supabase 用户到 Turso...\n');

  try {
    // 1. 获取所有 Supabase 用户
    console.log('📥 正在获取 Supabase 用户列表...');
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      throw new Error(`获取用户失败: ${error.message}`);
    }

    console.log(`✅ 获取到 ${users.users.length} 个用户\n`);

    // 2. 连接 Turso 全局数据库
    console.log('🔌 正在连接 Turso 数据库...');
    const globalDb = getGlobalDb();
    console.log('✅ Turso 数据库连接成功\n');

    // 3. 确保 profiles 表有所需列
    console.log('🔧 检查数据库表结构...');
    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN uid TEXT");
      console.log('  ✅ 添加 uid 列');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  uid 列已存在');
      }
    }

    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN invite_code TEXT");
      console.log('  ✅ 添加 invite_code 列');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  invite_code 列已存在');
      }
    }

    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN avatar_url TEXT");
      console.log('  ✅ 添加 avatar_url 列');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  avatar_url 列已存在');
      }
    }

    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN virtual_currency INTEGER DEFAULT 0");
      console.log('  ✅ 添加 virtual_currency 列');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  virtual_currency 列已存在');
      }
    }

    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN invitation_points INTEGER DEFAULT 0");
      console.log('  ✅ 添加 invitation_points 列');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  invitation_points 列已存在');
      }
    }

    try {
      const raw = getGlobalClient();
      await raw.execute("ALTER TABLE profiles ADD COLUMN free_posts_count INTEGER DEFAULT 0");
      console.log('  ✅ 添加 free_posts_count 列\n');
    } catch (e) {
      if (!e.message.includes('duplicate column')) {
        console.log('  ⚠️  free_posts_count 列已存在\n');
      }
    }

    // 4. 同步用户
    console.log('👥 开始同步用户...\n');
    
    let createdCount = 0;
    let skippedCount = 0;
    let unverifiedCount = 0;

    for (const user of users.users) {
      const email = user.email || '未知';
      const isVerified = !!user.email_confirmed_at;

      // 跳过未验证的用户
      if (!isVerified) {
        console.log(`⏭️  跳过未验证用户: ${email}`);
        unverifiedCount++;
        continue;
      }

      // 检查是否已存在
      const existing = await globalDb
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      
      if (existing && existing.length > 0) {
        console.log(`⏭️  已存在: ${email}`);
        skippedCount++;
        continue;
      }

      // 创建 profile
      const username = user.user_metadata?.username || user.email?.split('@')[0] || '用户';
      const hostname = user.user_metadata?.hostname || '';

      try {
        await globalDb.insert(profiles).values({
          id: user.id,
          username: username,
          avatarUrl: user.user_metadata?.avatar_url || null,
          tenantId: 0, // 全局数据库
          points: 0,
          virtualCurrency: 0,
          invitationPoints: 0,
          freePostsCount: 0,
          createdAt: user.created_at || new Date().toISOString(),
          uid: null,
          inviteCode: null,
        });

        console.log(`✅ 已创建: ${email} (用户名: ${username}, 主机: ${hostname || 'N/A'})`);
        createdCount++;
      } catch (error) {
        console.error(`❌ 创建失败: ${email}`, error.message);
      }
    }

    // 5. 显示统计
    console.log('\n' + '='.repeat(50));
    console.log('📊 同步完成统计:\n');
    console.log(`  ✅ 新创建: ${createdCount} 个`);
    console.log(`  ⏭️  已跳过: ${skippedCount} 个 (已存在)`);
    console.log(`  ⏭️  未验证: ${unverifiedCount} 个 (未验证邮箱)`);
    console.log(`  📧 总用户: ${users.users.length} 个`);
    console.log('='.repeat(50));

    if (unverifiedCount > 0) {
      console.log('\n⚠️  提示: 有 ' + unverifiedCount + ' 个用户未验证邮箱');
      console.log('   建议在 Supabase Dashboard → Authentication → Users 中手动验证');
    }

    if (createdCount > 0) {
      console.log('\n🎉 成功同步 ' + createdCount + ' 个用户到 Turso!');
    } else {
      console.log('\n✅ 所有用户已同步，无需操作');
    }

  } catch (error) {
    console.error('\n❌ 同步失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行同步
syncUsers();

