import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Upload, Trash, Tag, Filter } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import BatchImportDialog from '@/components/admin/BatchImportDialog';
import * as LucideIcons from 'lucide-react';

const renderIcon = (iconName) => {
    const IconComponent = LucideIcons[iconName];
    return IconComponent ? <IconComponent className="h-4 w-4 mr-2 text-foreground" /> : null;
};

const DesktopContentTable = ({ items, onEdit, onDelete, onToggleActive, enableSelection, selectedIds, onSelectItem, onSelectAll }) => {
  const allSelected = enableSelection && items.length > 0 && items.every(item => selectedIds.includes(item.id));
  const someSelected = enableSelection && selectedIds.length > 0 && !allSelected;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-foreground bg-secondary">
        <tr>
          {enableSelection && (
            <th className="p-3 font-normal w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                aria-label="全选"
                className={someSelected ? "data-[state=checked]:bg-primary" : ""}
              />
            </th>
          )}
          <th className="p-3 font-normal">内容摘要</th>
          <th className="p-3 font-normal">排序</th>
          <th className="p-3 font-normal">状态</th>
          <th className="p-3 font-normal text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-t border-border">
            {enableSelection && (
              <td className="p-3">
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => onSelectItem(item.id)}
                  aria-label={`选择 ${item.content.title || item.id}`}
                />
              </td>
            )}
            <td className="p-3 max-w-xs truncate text-foreground flex items-center">
              {item.content.icon && renderIcon(item.content.icon)}
              {item.content.title || item.content.text || item.content.name || JSON.stringify(item.content)}
            </td>
            <td className="p-3 text-foreground">{item.position}</td>
            <td className="p-3">
              <Switch checked={item.is_active} onCheckedChange={() => onToggleActive(item)} />
            </td>
            <td className="p-3 text-right">
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)}><Edit className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => onDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const MobileContentCards = ({ items, onEdit, onDelete, onToggleActive, enableSelection, selectedIds, onSelectItem }) => (
  <div className="space-y-3 p-4 bg-secondary rounded-b-md">
    {items.map(item => (
      <Card key={item.id} className="bg-background shadow-sm border border-border">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {enableSelection && (
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => onSelectItem(item.id)}
                aria-label={`选择 ${item.content.title || item.id}`}
                className="mt-1"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground truncate flex items-center">
                {item.content.icon && renderIcon(item.content.icon)}
                {item.content.title || item.content.text || item.content.name || JSON.stringify(item.content)}
              </p>
              <div className="flex items-center justify-between mt-4 text-sm text-foreground">
                <span>排序: {item.position}</span>
                <div className="flex items-center space-x-2">
                  <span>状态</span>
                  <Switch checked={item.is_active} onCheckedChange={() => onToggleActive(item)} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-2 p-2 bg-secondary border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
            <Edit className="h-4 w-4 mr-1" /> 编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-4 w-4 mr-1" /> 删除
          </Button>
        </CardFooter>
      </Card>
    ))}
  </div>
);

const ContentSection = ({ 
    sectionConfig, 
    sectionContent, 
    onEdit, 
    onDelete, 
    onReorder, 
    onAddNew, 
    onBatchImport, 
    onRemoveDuplicates,
    onBatchUpdateCategory,
    categoryOptions 
}) => {
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const [isImporting, setIsImporting] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [batchCategory, setBatchCategory] = useState('');
    const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'uncategorized' | category_slug

    // 仅为游戏卡片启用多选功能
    const enableSelection = sectionConfig.id === 'game_cards';
    const enableCategoryFilter = sectionConfig.id === 'game_cards';

    // 根据分类筛选内容
    const filteredContent = useMemo(() => {
        if (!enableCategoryFilter || !Array.isArray(sectionContent)) {
            return sectionContent;
        }

        if (filterCategory === 'all') {
            return sectionContent;
        }

        // 获取所有有效的分类值（从 categoryOptions 中）
        const validCategorySlugs = (categoryOptions || []).map(cat => cat.value);

        if (filterCategory === 'uncategorized') {
            return sectionContent.filter(item => {
                const categorySlug = item.content?.category_slug;
                
                // 未归类的条件：
                // 1. category_slug 不存在（undefined、null）
                // 2. category_slug 是空字符串或只有空格
                // 3. category_slug 不在有效分类列表中
                if (!categorySlug || categorySlug.trim() === '') {
                    return true;
                }
                
                // 检查是否是有效的分类值
                return !validCategorySlugs.includes(categorySlug);
            });
        }

        return sectionContent.filter(item => item.content?.category_slug === filterCategory);
    }, [sectionContent, filterCategory, enableCategoryFilter, categoryOptions]);

    const itemCount = Array.isArray(filteredContent) ? filteredContent.length : 0;
    const totalItemCount = Array.isArray(sectionContent) ? sectionContent.length : 0;

    // 统计各分类的游戏数量
    const categoryStats = useMemo(() => {
        if (!enableCategoryFilter || !Array.isArray(sectionContent)) {
            return {};
        }

        // 获取所有有效的分类值
        const validCategorySlugs = (categoryOptions || []).map(cat => cat.value);

        const stats = {
            all: sectionContent.length,
            uncategorized: 0,
        };

        sectionContent.forEach(item => {
            const catSlug = item.content?.category_slug;
            
            // 未归类的条件：
            // 1. category_slug 不存在或是空字符串
            // 2. category_slug 不在有效分类列表中
            if (!catSlug || catSlug.trim() === '' || !validCategorySlugs.includes(catSlug)) {
                stats.uncategorized++;
            } else {
                // 只统计有效的分类
                stats[catSlug] = (stats[catSlug] || 0) + 1;
            }
        });

        return stats;
    }, [sectionContent, enableCategoryFilter, categoryOptions]);

    const handleImportClick = () => {
        setIsImporting(true);
    };

    const handleToggleActive = async (item) => {
        // This is a placeholder. The actual implementation should be in PageContentManager
        console.log("Toggling active state for item:", item.id);
    };

    const handleSelectItem = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) 
                ? prev.filter(itemId => itemId !== id)
                : [...prev, id]
        );
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedIds(filteredContent.map(item => item.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleBatchUpdate = () => {
        if (selectedIds.length === 0) {
            alert('请先选择要修改的游戏卡片');
            return;
        }
        if (!batchCategory) {
            alert('请选择分类');
            return;
        }
        onBatchUpdateCategory(selectedIds, batchCategory);
        setSelectedIds([]);
        setBatchCategory('');
    };

    const handleClearSelection = () => {
        setSelectedIds([]);
        setBatchCategory('');
    };

    return (
        <>
            <Card className="border border-border">
                <div className="flex flex-wrap justify-between items-center p-4 border-b border-border gap-2">
                    <div>
                        <h3 className="font-semibold text-lg text-foreground">{sectionConfig.name}</h3>
                        <p className="text-sm text-muted-foreground">{sectionConfig.description}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap">
                        {sectionConfig.id === 'game_cards' && onRemoveDuplicates && (
                            <Button onClick={onRemoveDuplicates} size="sm" variant="outline" className="text-orange-600 hover:text-orange-700">
                                <Trash className="mr-2 h-4 w-4" />
                                去重
                            </Button>
                        )}
                        {sectionConfig.batchImport && (
                            <Button onClick={handleImportClick} size="sm" variant="outline">
                                <Upload className="mr-2 h-4 w-4 text-foreground" />
                                批量导入
                            </Button>
                        )}
                        <Button onClick={onAddNew} size="sm">
                            <PlusCircle className="mr-2 h-4 w-4 text-primary-foreground" />
                            新增
                        </Button>
                    </div>
                </div>

                {/* 分类筛选器 - 仅游戏卡片显示 */}
                {enableCategoryFilter && (
                    <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-center gap-2 mb-3">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">按分类筛选</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge
                                variant={filterCategory === 'all' ? 'default' : 'outline'}
                                className="cursor-pointer hover:bg-primary/80 transition-colors"
                                onClick={() => setFilterCategory('all')}
                            >
                                全部 ({categoryStats.all || 0})
                            </Badge>
                            <Badge
                                variant={filterCategory === 'uncategorized' ? 'default' : 'outline'}
                                className="cursor-pointer hover:bg-primary/80 transition-colors"
                                onClick={() => setFilterCategory('uncategorized')}
                            >
                                未归类 ({categoryStats.uncategorized || 0})
                            </Badge>
                            {categoryOptions && categoryOptions.map(cat => (
                                <Badge
                                    key={cat.value}
                                    variant={filterCategory === cat.value ? 'default' : 'outline'}
                                    className="cursor-pointer hover:bg-primary/80 transition-colors"
                                    onClick={() => setFilterCategory(cat.value)}
                                >
                                    {cat.label} ({categoryStats[cat.value] || 0})
                                </Badge>
                            ))}
                        </div>
                        {filterCategory !== 'all' && (
                            <div className="mt-2 text-xs text-muted-foreground">
                                当前筛选：
                                <span className="font-medium text-foreground ml-1">
                                    {filterCategory === 'uncategorized' 
                                        ? '未归类' 
                                        : categoryOptions?.find(c => c.value === filterCategory)?.label || filterCategory}
                                </span>
                                <span className="ml-2">显示 {itemCount} / {totalItemCount} 项</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 批量操作工具栏 - 仅在有选中项时显示 */}
                {enableSelection && selectedIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 border-b border-border">
                        <span className="text-sm font-medium text-foreground">
                            已选择 <span className="text-blue-600 dark:text-blue-400">{selectedIds.length}</span> 项
                        </span>
                        <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <Select value={batchCategory} onValueChange={setBatchCategory}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="选择分类" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categoryOptions && categoryOptions.map(cat => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                            {cat.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button 
                                onClick={handleBatchUpdate} 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Tag className="mr-2 h-4 w-4" />
                                批量设置分类
                            </Button>
                            <Button 
                                onClick={handleClearSelection} 
                                size="sm" 
                                variant="outline"
                            >
                                取消选择
                            </Button>
                        </div>
                    </div>
                )}
                
                <CardContent className="p-0">
                {itemCount > 0 ? (
                    isDesktop ? 
                    <DesktopContentTable 
                        items={filteredContent} 
                        onEdit={onEdit} 
                        onDelete={onDelete} 
                        onToggleActive={handleToggleActive} 
                        onReorder={onReorder}
                        enableSelection={enableSelection}
                        selectedIds={selectedIds}
                        onSelectItem={handleSelectItem}
                        onSelectAll={handleSelectAll}
                    /> :
                    <MobileContentCards 
                        items={filteredContent} 
                        onEdit={onEdit} 
                        onDelete={onDelete} 
                        onToggleActive={handleToggleActive} 
                        onReorder={onReorder}
                        enableSelection={enableSelection}
                        selectedIds={selectedIds}
                        onSelectItem={handleSelectItem}
                    />
                ) : (
                    <div className="text-center p-8">
                        <p className="text-muted-foreground">
                            {enableCategoryFilter && filterCategory !== 'all' 
                                ? `当前筛选条件下暂无内容项` 
                                : '此模块下暂无内容项。'}
                        </p>
                    </div>
                )}
                </CardContent>
            </Card>
            {isImporting && (
                <BatchImportDialog
                    open={isImporting}
                    onOpenChange={setIsImporting}
                    onImport={onBatchImport}
                    page={sectionConfig.pageId}
                    section={sectionConfig.id}
                />
            )}
        </>
    );
};

export default ContentSection;