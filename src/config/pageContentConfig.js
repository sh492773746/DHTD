export const pageConfig = {
  home: {
    name: '首页',
    sections: [
      { id: 'carousel', name: '轮播图', tenantEditable: true, fields: [
        { id: 'title', label: '标题', type: 'text', placeholder: '请输入轮播图标题' },
        { id: 'description', label: '描述', type: 'textarea', placeholder: '请输入描述信息' },
        { id: 'image_url', label: '图片', type: 'image' },
        { id: 'details_title', label: '详情标题', type: 'text', placeholder: '展开后显示的标题' },
        { id: 'details_content', label: '详情内容', type: 'textarea', placeholder: '展开后显示的详细描述' },
        { id: 'overlay_opacity', label: '遮罩透明度 (0-100)', type: 'number', placeholder: '默认 10' },
      ]},
      { id: 'announcements', name: '滚动公告', tenantEditable: true, fields: [
        { id: 'text', label: '公告文本', type: 'text', placeholder: '请输入滚动公告内容' },
      ]},
      { id: 'feature_cards', name: '功能卡片', tenantEditable: true, fields: [
        { id: 'title', label: '标题', type: 'text' },
        { id: 'description', label: '描述', type: 'text' },
        { id: 'path', label: '路径', type: 'text', placeholder: '/social' },
        { id: 'icon', label: '图标', type: 'icon' },
        { id: 'style', label: '卡片样式', type: 'select', options: [
            { value: 'from-sky-500 to-indigo-500', label: '天空蓝 -> 靛蓝' },
            { value: 'from-violet-500 to-fuchsia-500', label: '紫罗兰 -> 紫红' },
            { value: 'from-emerald-500 to-teal-500', label: '翡翠绿 -> 青色' },
            { value: 'from-rose-400 to-red-500', label: '玫瑰红 -> 红色' },
            { value: 'from-amber-400 to-orange-500', label: '琥珀黄 -> 橙色' },
            { value: 'from-lime-400 to-green-500', label: '酸橙绿 -> 绿色' },
            { value: 'from-cyan-400 to-blue-500', label: '青蓝 -> 蓝色' },
            { value: 'from-pink-500 to-rose-500', label: '粉色 -> 玫瑰色' },
            { value: 'from-purple-500 to-indigo-600', label: '紫色 -> 靛蓝' },
            { value: 'from-gray-700 to-gray-900', label: '深灰 -> 黑色' },
            { value: 'from-yellow-200 to-yellow-400', label: '柠檬黄 -> 金色' },
          ] 
        },
      ]},
      { id: 'hot_games', name: '热门推荐 (首页)', tenantEditable: true, fields: [
        { id: 'title', label: '游戏标题', type: 'text' },
        { id: 'description', label: '游戏描述', type: 'text' },
        { id: 'path', label: '路径', type: 'text', placeholder: '/games/some-game' },
        { id: 'iconUrl', label: '图标', type: 'image' },
        { id: 'info', label: '提示信息', type: 'text' },
        { id: 'isOfficial', label: '官方标签', type: 'boolean' },
      ], batchImport: true },
    ],
  },
  games: {
    name: '游戏',
    sections: [
        { id: 'game_categories', name: '游戏分类', tenantEditable: false, fields: [
            { id: 'name', label: '菜单名称', type: 'text' },
            { id: 'slug', label: '菜单ID (英文, 唯一)', type: 'text' },
            { id: 'icon', label: '菜单图标', type: 'icon' },
        ], batchImport: false },
        { id: 'game_cards', name: '游戏卡片', tenantEditable: true, fields: [
            { id: 'title', label: '游戏标题', type: 'text' },
            { id: 'category_slug', label: '所属分类', type: 'select' },
            { id: 'description', label: '游戏描述', type: 'text' },
            { id: 'path', label: '路径', type: 'text', placeholder: '/games/some-game' },
            { id: 'iconUrl', label: '图标', type: 'image' },
            { id: 'info', label: '提示信息', type: 'text' },
            { id: 'isOfficial', label: '官方标签', type: 'boolean' },
        ], batchImport: true },
    ],
  },
  social: {
    name: '朋友圈',
    sections: [
       { id: 'pinned_ads', name: '置顶广告', tenantEditable: false, globalOnly: true, fields: [
        { id: 'title', label: '广告标题', type: 'text' },
        { id: 'description', label: '广告描述', type: 'text' },
        { id: 'link_url', label: '跳转链接', type: 'text' },
        { id: 'background_image_url', label: '背景图', type: 'image', hint: '推荐尺寸: 1200x160px' },
      ]},
    ],
  },
  my_page: {
    name: '我的页面',
    sections: [
      { id: 'pg_live_stream', name: '精彩PG直播', tenantEditable: false, fields: [
        { id: 'title', label: '标题', type: 'text' },
        { id: 'description', label: '描述', type: 'textarea' },
        { id: 'link_url', label: '跳转链接', type: 'text' },
        { id: 'image_url', label: '封面图片', type: 'image', hint: '推荐尺寸: 1200x200px' },
      ]},
    ],
  },
};