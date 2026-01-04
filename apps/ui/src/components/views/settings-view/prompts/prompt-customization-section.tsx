import { useState } from 'react';
import { MessageSquare, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
} from '@automaker/prompts';
import type { PromptCustomization, CustomPrompt } from '@automaker/types';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

interface PromptFieldProps {
  label: string;
  description?: string;
  defaultValue: string;
  customValue?: CustomPrompt;
  onChange: (value: string) => void;
  onToggle: (enabled: boolean) => void;
  critical?: boolean;
}

function PromptField({
  label,
  description,
  defaultValue,
  customValue,
  onChange,
  onToggle,
  critical = false,
}: PromptFieldProps) {
  const isEnabled = customValue?.enabled ?? false;
  const displayValue = isEnabled ? (customValue?.value ?? defaultValue) : defaultValue;

  // Dynamic height based on content
  const calculateMinHeight = (text: string) => {
    const lines = text.split('\n').length;
    const baseHeight = 120;
    const lineHeight = 20;
    return Math.min(baseHeight + lines * lineHeight, 600);
  };

  const minHeight = calculateMinHeight(displayValue);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-foreground">
          {label}
          <Badge variant={isEnabled ? 'default' : 'secondary'} className="text-xs">
            {isEnabled ? 'Custom' : 'Default'}
          </Badge>
        </Label>
        <Switch checked={isEnabled} onCheckedChange={onToggle} />
      </div>

      {critical && isEnabled && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive/90">
            This prompt requires a specific output format. Breaking this may cause feature failures.
          </p>
        </div>
      )}

      <Textarea
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!isEnabled}
        style={{ minHeight }}
        className={cn('font-mono text-xs resize-y', !isEnabled && 'cursor-not-allowed bg-muted/50')}
      />

      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

interface PromptCategoryProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  customization: PromptCustomization;
  category: keyof PromptCustomization;
  defaults: Record<string, { label: string; description?: string; critical?: boolean }>;
  onChange: (category: keyof PromptCustomization, field: string, value: string | boolean) => void;
  onResetCategory: (category: keyof PromptCustomization) => void;
}

function PromptCategory({
  title,
  description,
  icon,
  customization,
  category,
  defaults,
  onChange,
  onResetCategory,
}: PromptCategoryProps) {
  const categoryData = customization[category];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
              {icon}
            </div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground ml-10">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResetCategory(category)}
          className="shrink-0"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset All
        </Button>
      </div>

      <div className="space-y-4">
        {Object.entries(defaults).map(([field, config]) => {
          const customValue = (categoryData as Record<string, CustomPrompt>)?.[field];
          return (
            <PromptField
              key={field}
              label={config.label}
              description={config.description}
              defaultValue={config.defaultValue || ''}
              customValue={customValue}
              onChange={(value) => onChange(category, field, value)}
              onToggle={(enabled) => onChange(category, field, enabled)}
              critical={config.critical}
            />
          );
        })}
      </div>
    </div>
  );
}

interface PromptCustomizationSectionProps {
  className?: string;
}

export function PromptCustomizationSection({ className }: PromptCustomizationSectionProps) {
  const {
    promptCustomization,
    setPromptCustomization,
    updatePromptCustomization,
    resetPromptCustomization,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<keyof PromptCustomization>('autoMode');

  const handleChange = (
    category: keyof PromptCustomization,
    field: string,
    value: string | boolean
  ) => {
    const categoryData = promptCustomization[category] || {};
    const fieldData = (categoryData as Record<string, CustomPrompt>)[field] || {
      value: '',
      enabled: false,
    };

    let newValue: string | boolean;
    if (typeof value === 'boolean') {
      newValue = value;
      (fieldData as CustomPrompt).enabled = value;
    } else {
      newValue = value;
      (fieldData as CustomPrompt).value = value;
    }

    updatePromptCustomization({
      [category]: {
        ...categoryData,
        [field]: {
          ...fieldData,
          value: typeof newValue === 'boolean' ? fieldData.value : newValue,
          enabled: fieldData.enabled,
        },
      },
    });
  };

  const handleResetCategory = (category: keyof PromptCustomization) => {
    const newCustomization = { ...promptCustomization };
    delete newCustomization[category];
    setPromptCustomization(newCustomization);
  };

  const handleResetAll = () => {
    resetPromptCustomization();
  };

  // Tab definitions
  const tabs: Array<{
    key: keyof PromptCustomization;
    label: string;
    icon: React.ReactNode;
    description: string;
    defaults: Record<
      string,
      { label: string; description?: string; critical?: boolean; defaultValue?: string }
    >;
  }> = [
    {
      key: 'autoMode',
      label: 'Auto Mode',
      icon: <MessageSquare className="w-4 h-4" />,
      description: 'Customize prompts used in autonomous development mode',
      defaults: {
        planningLite: {
          label: 'Planning: Lite Mode',
          critical: true,
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningLite,
        },
        planningLiteWithApproval: {
          label: 'Planning: Lite with Approval',
          critical: true,
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningLiteWithApproval,
        },
        planningSpec: {
          label: 'Planning: Spec Mode',
          critical: true,
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningSpec,
        },
        planningFull: {
          label: 'Planning: Full SDD Mode',
          critical: true,
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningFull,
        },
        featurePromptTemplate: {
          label: 'Feature Prompt Template',
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.featurePromptTemplate,
        },
        followUpPromptTemplate: {
          label: 'Follow-up Prompt Template',
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.followUpPromptTemplate,
        },
        continuationPromptTemplate: {
          label: 'Continuation Prompt Template',
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.continuationPromptTemplate,
        },
        pipelineStepPromptTemplate: {
          label: 'Pipeline Step Template',
          defaultValue: DEFAULT_AUTO_MODE_PROMPTS.pipelineStepPromptTemplate,
        },
      },
    },
    {
      key: 'agent',
      label: 'Agent',
      icon: <MessageSquare className="w-4 h-4" />,
      description: 'Customize the default agent system prompt',
      defaults: {
        systemPrompt: {
          label: 'System Prompt',
          critical: true,
          defaultValue: DEFAULT_AGENT_PROMPTS.systemPrompt,
        },
      },
    },
    {
      key: 'backlogPlan',
      label: 'Backlog Plan',
      icon: <MessageSquare className="w-4 h-4" />,
      description: 'Customize prompts for backlog planning',
      defaults: {
        systemPrompt: {
          label: 'System Prompt',
          critical: true,
          description: 'Requires valid JSON output',
          defaultValue: DEFAULT_BACKLOG_PLAN_PROMPTS.systemPrompt,
        },
        userPromptTemplate: {
          label: 'User Prompt Template',
          defaultValue: DEFAULT_BACKLOG_PLAN_PROMPTS.userPromptTemplate,
        },
      },
    },
    {
      key: 'enhancement',
      label: 'Enhance',
      icon: <MessageSquare className="w-4 h-4" />,
      description: 'Customize prompts for feature enhancement',
      defaults: {
        improveSystemPrompt: {
          label: 'Improve Mode',
          defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.improveSystemPrompt,
        },
        technicalSystemPrompt: {
          label: 'Technical Mode',
          defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.technicalSystemPrompt,
        },
        simplifySystemPrompt: {
          label: 'Simplify Mode',
          defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.simplifySystemPrompt,
        },
        acceptanceSystemPrompt: {
          label: 'Acceptance Mode',
          defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.acceptanceSystemPrompt,
        },
      },
    },
  ];

  const activeTabConfig = tabs.find((t) => t.key === activeTab);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">Prompt Customization</h2>
          <p className="text-muted-foreground">
            Customize AI prompts for different features. Custom prompts are preserved when disabled.
          </p>
        </div>
        <Button variant="outline" onClick={handleResetAll}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset All
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-brand-500/5 border border-brand-500/10">
        <Info className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">How Prompt Customization Works</p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>• Toggle prompts to customize. Custom values are preserved when disabled.</li>
            <li>• Critical prompts have specific output formats - modify with care.</li>
            <li>• Use markers like [PLAN_GENERATED], [SPEC_GENERATED] for parsing.</li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-6">
        {/* Tab navigation */}
        <div className="flex flex-wrap gap-2 border-b border-border/50 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTabConfig && (
          <PromptCategory
            title={activeTabConfig.label}
            description={activeTabConfig.description}
            icon={activeTabConfig.icon}
            customization={promptCustomization}
            category={activeTabConfig.key}
            defaults={activeTabConfig.defaults}
            onChange={handleChange}
            onResetCategory={handleResetCategory}
          />
        )}
      </div>
    </div>
  );
}
