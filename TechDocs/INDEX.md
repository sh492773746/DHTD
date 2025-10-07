# 📚 技术文档索引

> 本文件夹包含所有项目技术文档
> 最后更新: 2025-10-07

---

## 📖 目录导航

### 🚀 性能优化
- [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md) - **最新性能优化指南**
  - LCP 优化（5.18s → 1.5-2.0s）
  - Vite 构建优化
  - 图片加载优化
  - HTML 优化
  - esbuild 压缩配置

- [PERFORMANCE_OPTIMIZATION_GUIDE.md](./PERFORMANCE_OPTIMIZATION_GUIDE.md) - 性能优化完整指南
  - 前端性能优化策略
  - 后端性能优化
  - 数据库优化

### 📦 依赖管理
- [DEPENDENCIES_CHECK.md](./DEPENDENCIES_CHECK.md) - **依赖检查报告**
  - 51 个生产依赖清单
  - 14 个开发依赖清单
  - esbuild vs terser 对比
  - 依赖健康检查

### 🔒 安全性
- [SECURITY_AND_OPTIMIZATION_REPORT.md](./SECURITY_AND_OPTIMIZATION_REPORT.md) - 安全与优化报告
  - 安全漏洞修复
  - 环境变量管理
  - 认证安全

- [RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md](./RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md) - 速率限制与审计升级
  - API 速率限制
  - 审计日志
  - 错误处理

### 🎮 功能模块
- [LANDING_PAGE_GUIDE.md](./LANDING_PAGE_GUIDE.md) - **Landing Page 配置指南** 🆕
  - 完整配置教程
  - 常见问题解答
  - 调试指南

- [PREDICTION_DASHBOARD_GUIDE.md](./PREDICTION_DASHBOARD_GUIDE.md) - 预测仪表板指南
  - 预测算法
  - 数据展示
  - 用户交互

- [POINTS_SYNC_FIX.md](./POINTS_SYNC_FIX.md) - 积分同步修复文档
  - 积分系统
  - 数据同步
  - 问题修复

### ⚛️ React 开发
- [REACT_GUIDE.md](./REACT_GUIDE.md) - React 开发指南
  - 组件开发规范
  - Hooks 使用
  - 状态管理
  - 最佳实践

### 📋 项目文档
- [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) - 项目完整文档
  - 项目架构
  - 技术栈
  - 开发流程
  - 部署指南

---

## 🗂️ 文档分类

### 优先级分类

#### 🔥 高优先级（必读）
1. **PERFORMANCE_OPTIMIZATION.md** - 最新性能优化（v1.6.0+）
2. **DEPENDENCIES_CHECK.md** - 依赖管理和健康检查
3. **PROJECT_DOCUMENTATION.md** - 项目总览

#### ⚡ 中优先级（建议阅读）
1. **REACT_GUIDE.md** - 前端开发规范
2. **SECURITY_AND_OPTIMIZATION_REPORT.md** - 安全最佳实践
3. **PERFORMANCE_OPTIMIZATION_GUIDE.md** - 性能优化完整策略

#### 📌 低优先级（按需阅读）
1. **PREDICTION_DASHBOARD_GUIDE.md** - 预测功能开发
2. **POINTS_SYNC_FIX.md** - 积分系统问题排查
3. **RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md** - 高级功能配置

---

## 📊 文档状态

| 文档 | 版本 | 状态 | 最后更新 |
|------|------|------|----------|
| PERFORMANCE_OPTIMIZATION.md | v1.6.0 | ✅ 最新 | 2025-10-07 |
| DEPENDENCIES_CHECK.md | v1.7.4 | ✅ 最新 | 2025-10-07 |
| PROJECT_DOCUMENTATION.md | - | ✅ 完整 | - |
| REACT_GUIDE.md | - | ✅ 完整 | - |
| SECURITY_AND_OPTIMIZATION_REPORT.md | - | ✅ 完整 | - |
| PERFORMANCE_OPTIMIZATION_GUIDE.md | - | ✅ 完整 | - |
| LANDING_PAGE_GUIDE.md | v1.0.0 | ✅ 最新 | 2025-10-07 |
| PREDICTION_DASHBOARD_GUIDE.md | - | ✅ 完整 | - |
| POINTS_SYNC_FIX.md | - | ✅ 完整 | - |
| RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md | - | ✅ 完整 | - |

---

## 🎯 快速导航

### 🆕 新加入项目？
1. 阅读 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) 了解项目架构
2. 阅读 [REACT_GUIDE.md](./REACT_GUIDE.md) 了解开发规范
3. 阅读 [DEPENDENCIES_CHECK.md](./DEPENDENCIES_CHECK.md) 了解依赖管理

### 🐛 遇到性能问题？
1. 查看 [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md) 最新优化方案
2. 参考 [PERFORMANCE_OPTIMIZATION_GUIDE.md](./PERFORMANCE_OPTIMIZATION_GUIDE.md) 完整指南

### 🔧 需要修复 Bug？
1. 检查相关功能模块文档
2. 查看 [POINTS_SYNC_FIX.md](./POINTS_SYNC_FIX.md) 了解问题排查流程

### 🎨 配置 Landing Page？
1. 阅读 [LANDING_PAGE_GUIDE.md](./LANDING_PAGE_GUIDE.md) 配置指南
2. 按步骤在后台创建内容项
3. 查看常见问题解答

### 🔒 安全相关？
1. 阅读 [SECURITY_AND_OPTIMIZATION_REPORT.md](./SECURITY_AND_OPTIMIZATION_REPORT.md)
2. 参考 [RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md](./RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md)

### 📦 依赖问题？
1. 查看 [DEPENDENCIES_CHECK.md](./DEPENDENCIES_CHECK.md)
2. 运行 `npm audit` 检查安全漏洞
3. 运行 `npm outdated` 检查过期依赖

---

## 📝 文档维护规范

### 新增文档
1. 所有技术文档必须放在 `TechDocs/` 文件夹
2. 文件名使用大写字母和下划线（如：`NEW_FEATURE_GUIDE.md`）
3. 必须更新本索引文件

### 文档格式要求
```markdown
# 文档标题

> 简短描述
> 最后更新: YYYY-MM-DD
> 版本: vX.X.X (可选)

## 目录
- [章节1](#章节1)
- [章节2](#章节2)

## 内容
...
```

### 文档类型
- **指南 (GUIDE)**: 教程类文档，如 `REACT_GUIDE.md`
- **报告 (REPORT)**: 分析类文档，如 `DEPENDENCIES_CHECK.md`
- **修复 (FIX)**: 问题修复文档，如 `POINTS_SYNC_FIX.md`
- **优化 (OPTIMIZATION)**: 优化相关，如 `PERFORMANCE_OPTIMIZATION.md`

---

## 🔍 搜索技巧

### 按关键词查找
```bash
# 在所有文档中搜索关键词
grep -r "性能优化" TechDocs/

# 查找特定文件
ls TechDocs/ | grep PERFORMANCE
```

### 按主题查找
- **性能**: `PERFORMANCE_*`
- **安全**: `SECURITY_*`
- **功能**: `*_GUIDE.md`
- **修复**: `*_FIX.md`

---

## 📚 相关资源

### 项目根目录文档
- [README.md](../README.md) - 项目说明
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南

### 外部资源
- [React 官方文档](https://react.dev/)
- [Vite 官方文档](https://vitejs.dev/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Supabase 文档](https://supabase.com/docs)

---

## 🎯 文档质量标准

### ✅ 优秀文档特征
- 📝 结构清晰，目录完整
- 💡 有实际代码示例
- 📊 有对比表格或图表
- 🎯 有具体的解决方案
- ✅ 有验证步骤

### ❌ 需要改进
- 结构混乱
- 缺少示例
- 过于抽象
- 缺少验证方法

---

## 📞 联系方式

如有文档问题或建议：
- 提交 Issue
- 提交 Pull Request
- 联系项目维护者

---

## 📊 文档统计

- **总文档数**: 10 个 📈
- **性能优化**: 2 个
- **功能指南**: 4 个 🆕
- **安全相关**: 2 个
- **开发规范**: 1 个
- **项目文档**: 1 个

---

**提示**: 本索引会随着项目发展持续更新，建议收藏此页面！

最后更新: 2025-10-07 | 版本: v1.0.0

