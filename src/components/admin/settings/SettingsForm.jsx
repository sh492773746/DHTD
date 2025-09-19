import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ImageUploader from '@/components/ImageUploader';

const HIDDEN_KEYS = new Set(['global_obfuscate_text_enabled']);

const SettingsForm = ({ settings, onInputChange, onRevertToDefault, isSuperAdmin, isManagingSubTenant, tenantEditableKeys }) => {
  const renderSettingInput = (key, setting) => {
    const { value, type } = setting;
    if (key === 'social_forum_mode') {
      const mode = (value || 'shared').toLowerCase();
      return (
        <div className="flex items-center gap-3">
          <span className={mode === 'isolated' ? 'font-semibold' : 'text-muted-foreground'}>独享</span>
          <Switch
            checked={mode === 'shared'}
            onCheckedChange={(checked) => onInputChange(key, checked ? 'shared' : 'isolated')}
          />
          <span className={mode === 'shared' ? 'font-semibold' : 'text-muted-foreground'}>共享</span>
        </div>
      );
    }
    switch (type) {
      case 'boolean':
        return <Switch checked={value === 'true' || value === true} onCheckedChange={(val) => onInputChange(key, val.toString())} />;
      case 'image':
        return <ImageUploader initialUrl={value} onUrlChange={(url) => onInputChange(key, url)} bucketName="site-assets" />;
      case 'textarea':
        return <Textarea value={value || ''} onChange={(e) => onInputChange(key, e.target.value)} />;
      default:
        return <Input type={type || 'text'} value={value || ''} onChange={(e) => onInputChange(key, e.target.value)} />;
    }
  };

  const allSettingKeys = Object.keys(settings).filter(k => !HIDDEN_KEYS.has(k)).sort();

  const settingsToDisplay = isSuperAdmin 
    ? allSettingKeys
    : allSettingKeys.filter(key => tenantEditableKeys.includes(key));


  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {settingsToDisplay.length > 0 ? settingsToDisplay.map(key => {
          const setting = settings[key];
          if (!setting) return null;
          return (
            <div key={key} className="grid md:grid-cols-3 gap-4 items-start border-b pb-4 last:border-b-0">
              <div className="md:col-span-1">
                <Label htmlFor={key} className="font-semibold">{setting.name || key}</Label>
                <p className="text-xs text-muted-foreground mt-1">{setting.description}</p>
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <div className="flex-grow">
                  {renderSettingInput(key, setting)}
                </div>
                {isManagingSubTenant && isSuperAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevertToDefault(key)}
                    disabled={!setting.is_custom}
                  >
                    恢复默认
                  </Button>
                )}
                 {!isSuperAdmin && isManagingSubTenant && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevertToDefault(key)}
                    disabled={!setting.is_custom}
                  >
                    恢复默认
                  </Button>
                )}
              </div>
            </div>
          )
        }) : (
          <div className="text-center p-8 text-muted-foreground">
            该站点暂无任何设置项。
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SettingsForm;