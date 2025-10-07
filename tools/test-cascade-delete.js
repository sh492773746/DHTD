/**
 * 测试用户级联删除功能
 * 
 * 使用方法:
 * node tools/test-cascade-delete.js <user-id> [admin-token]
 * 
 * 示例:
 * node tools/test-cascade-delete.js 550e8400-e29b-41d4-a716-446655440000
 */

import { getGlobalDb } from '../server/tursoApi.js';
import { profiles, posts as postsTable, comments as commentsTable, invitations } from '../server/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testCascadeDelete(userId, adminToken) {
  console.log('🔍 测试用户级联删除功能\n');
  console.log(`User ID: ${userId}`);
  console.log(`API URL: ${API_URL}\n`);
  
  const gdb = getGlobalDb();
  
  // === 步骤 1: 删除前检查 ===
  console.log('='.repeat(50));
  console.log('📊 删除前数据统计');
  console.log('='.repeat(50));
  
  let profile, userPosts, userComments, userInvitations;
  
  try {
    profile = await gdb.select().from(profiles).where(eq(profiles.id, userId));
    console.log(`✅ Profile: ${profile.length} 条`);
    if (profile.length > 0) {
      console.log(`   - 用户名: ${profile[0].username}`);
      console.log(`   - 积分: ${profile[0].points || 0}`);
      console.log(`   - 创建时间: ${profile[0].createdAt || 'N/A'}`);
    }
  } catch (e) {
    console.log(`❌ Profile 查询失败: ${e.message}`);
    profile = [];
  }
  
  try {
    userPosts = await gdb.select().from(postsTable).where(eq(postsTable.userId, userId));
    console.log(`✅ Posts: ${userPosts.length} 条`);
  } catch (e) {
    console.log(`❌ Posts 查询失败: ${e.message}`);
    userPosts = [];
  }
  
  try {
    userComments = await gdb.select().from(commentsTable).where(eq(commentsTable.userId, userId));
    console.log(`✅ Comments: ${userComments.length} 条`);
  } catch (e) {
    console.log(`❌ Comments 查询失败: ${e.message}`);
    userComments = [];
  }
  
  try {
    userInvitations = await gdb.select().from(invitations).where(eq(invitations.inviterId, userId));
    console.log(`✅ Invitations (作为邀请人): ${userInvitations.length} 条`);
  } catch (e) {
    console.log(`❌ Invitations 查询失败: ${e.message}`);
    userInvitations = [];
  }
  
  if (profile.length === 0) {
    console.log('\n⚠️  警告: 该用户不存在于 Turso 数据库');
    console.log('   用户可能只存在于 Supabase Authentication');
  }
  
  // === 步骤 2: 确认删除 ===
  console.log('\n' + '='.repeat(50));
  console.log('⚠️  即将删除用户');
  console.log('='.repeat(50));
  console.log('此操作将删除:');
  console.log(`  - Supabase 认证账号`);
  console.log(`  - ${profile.length} 个 Profile`);
  console.log(`  - ${userPosts.length} 个 Post`);
  console.log(`  - ${userComments.length} 个 Comment`);
  console.log(`  - ${userInvitations.length} 个 Invitation`);
  console.log('\n⏳ 5 秒后开始删除...');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // === 步骤 3: 调用删除 API ===
  console.log('\n' + '='.repeat(50));
  console.log('🗑️  执行删除操作');
  console.log('='.repeat(50));
  
  if (!adminToken) {
    console.log('❌ 错误: 需要提供管理员 token');
    console.log('   使用方法: node tools/test-cascade-delete.js <user-id> <admin-token>');
    console.log('\n获取 token:');
    console.log('   1. 登录管理员账号');
    console.log('   2. 打开浏览器开发者工具 → Application → Local Storage');
    console.log('   3. 复制 supabase.auth.token 的 access_token 值');
    process.exit(1);
  }
  
  try {
    console.log(`请求: DELETE ${API_URL}/api/admin/users/${userId}`);
    
    const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    
    const result = await response.json();
    
    console.log('\n📋 API 响应:');
    console.log(JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      console.log(`\n❌ 删除失败 (HTTP ${response.status})`);
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
      if (result.message) {
        console.log(`   消息: ${result.message}`);
      }
      process.exit(1);
    }
    
    if (!result.ok) {
      console.log('\n⚠️  部分删除成功');
      console.log(`   ${result.message || '未知错误'}`);
      if (result.deletedData?.errors?.length > 0) {
        console.log('\n错误详情:');
        result.deletedData.errors.forEach(err => console.log(`   - ${err}`));
      }
    } else {
      console.log('\n✅ 删除成功！');
    }
    
  } catch (error) {
    console.log(`\n❌ API 调用失败: ${error.message}`);
    console.log('\n可能原因:');
    console.log('   1. API 服务器未启动');
    console.log('   2. API_URL 配置错误');
    console.log('   3. 网络连接问题');
    process.exit(1);
  }
  
  // === 步骤 4: 删除后验证 ===
  console.log('\n' + '='.repeat(50));
  console.log('🔍 删除后验证');
  console.log('='.repeat(50));
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  let profileAfter, postsAfter, commentsAfter, invitationsAfter;
  
  try {
    profileAfter = await gdb.select().from(profiles).where(eq(profiles.id, userId));
    console.log(`Profile: ${profileAfter.length} 条 ${profileAfter.length === 0 ? '✅' : '❌'}`);
  } catch (e) {
    console.log(`Profile 查询失败: ${e.message}`);
    profileAfter = [];
  }
  
  try {
    postsAfter = await gdb.select().from(postsTable).where(eq(postsTable.userId, userId));
    console.log(`Posts: ${postsAfter.length} 条 ${postsAfter.length === 0 ? '✅' : '❌'}`);
  } catch (e) {
    console.log(`Posts 查询失败: ${e.message}`);
    postsAfter = [];
  }
  
  try {
    commentsAfter = await gdb.select().from(commentsTable).where(eq(commentsTable.userId, userId));
    console.log(`Comments: ${commentsAfter.length} 条 ${commentsAfter.length === 0 ? '✅' : '❌'}`);
  } catch (e) {
    console.log(`Comments 查询失败: ${e.message}`);
    commentsAfter = [];
  }
  
  try {
    invitationsAfter = await gdb.select().from(invitations).where(eq(invitations.inviterId, userId));
    console.log(`Invitations: ${invitationsAfter.length} 条 ${invitationsAfter.length === 0 ? '✅' : '❌'}`);
  } catch (e) {
    console.log(`Invitations 查询失败: ${e.message}`);
    invitationsAfter = [];
  }
  
  // === 最终结果 ===
  console.log('\n' + '='.repeat(50));
  const allClean = profileAfter.length === 0 && 
                   postsAfter.length === 0 && 
                   commentsAfter.length === 0 && 
                   invitationsAfter.length === 0;
  
  if (allClean) {
    console.log('🎉 级联删除成功！所有数据已清理');
  } else {
    console.log('⚠️  级联删除不完整！部分数据仍存在');
    console.log('\n残留数据:');
    if (profileAfter.length > 0) console.log(`  - ${profileAfter.length} 个 Profile`);
    if (postsAfter.length > 0) console.log(`  - ${postsAfter.length} 个 Post`);
    if (commentsAfter.length > 0) console.log(`  - ${commentsAfter.length} 个 Comment`);
    if (invitationsAfter.length > 0) console.log(`  - ${invitationsAfter.length} 个 Invitation`);
  }
  console.log('='.repeat(50));
}

// === 运行测试 ===

const userId = process.argv[2];
const adminToken = process.argv[3];

if (!userId) {
  console.error('❌ 错误: 缺少 user-id 参数');
  console.error('\n使用方法:');
  console.error('  node tools/test-cascade-delete.js <user-id> <admin-token>');
  console.error('\n示例:');
  console.error('  node tools/test-cascade-delete.js 550e8400-e29b-41d4-a716-446655440000 eyJhbGc...');
  console.error('\n获取 User ID:');
  console.error('  1. 打开 Supabase Dashboard → Authentication → Users');
  console.error('  2. 复制要删除的用户的 ID');
  console.error('\n获取 Admin Token:');
  console.error('  1. 登录超级管理员账号');
  console.error('  2. 浏览器开发者工具 → Application → Local Storage');
  console.error('  3. 复制 supabase.auth.token 的 access_token 值');
  process.exit(1);
}

testCascadeDelete(userId, adminToken).catch(err => {
  console.error('\n💥 测试过程出错:', err);
  console.error(err.stack);
  process.exit(1);
});

