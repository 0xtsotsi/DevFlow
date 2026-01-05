import {
  Settings2,
  Brain,
  Zap,
  ShieldCheck,
  FileCode,
  Bug,
  FileText,
  Wand2,
  Workflow,
  Bot,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AGENT_TYPE_METADATA, AGENT_MODEL_INFO, DEFAULT_AGENT_MODELS } from '@automaker/types';
import type { AgentType, AgentModel } from '@automaker/types';
import { CLAUDE_MODELS } from '@/components/views/board-view/shared/model-constants';

// Icon mapping for agent types
const AGENT_ICONS: Record<AgentType, React.ReactNode> = {
  planning: <Brain className="w-4 h-4" />,
  implementation: <Zap className="w-4 h-4" />,
  testing: <ShieldCheck className="w-4 h-4" />,
  review: <FileCode className="w-4 h-4" />,
  debug: <Bug className="w-4 h-4" />,
  documentation: <FileText className="w-4 h-4" />,
  refactoring: <Wand2 className="w-4 h-4" />,
  orchestration: <Workflow className="w-4 h-4" />,
  generic: <Bot className="w-4 h-4" />,
};

export function AgentModelsSection() {
  const { agentModelSettings, setAgentModel, resetAgentModels } = useAppStore();
  const agentModels = agentModelSettings?.agents || {};

  const handleModelChange = (agentType: AgentType, model: AgentModel) => {
    setAgentModel(agentType, model);
  };

  const handleReset = () => {
    resetAgentModels();
  };

  const getCurrentModel = (agentType: AgentType): AgentModel => {
    return agentModels[agentType] || DEFAULT_AGENT_MODELS[agentType];
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
                <Settings2 className="w-5 h-5 text-brand-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">Agent Models</h2>
            </div>
            <p className="text-sm text-muted-foreground/80 ml-12">
              Configure which Claude model each agent type uses for optimal cost and performance
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset All
          </Button>
        </div>
      </div>

      {/* Agent List */}
      <div className="p-6 space-y-4">
        {(Object.keys(AGENT_TYPE_METADATA) as AgentType[]).map((agentType) => {
          const metadata = AGENT_TYPE_METADATA[agentType];
          const currentModel = getCurrentModel(agentType);
          const modelInfo = AGENT_MODEL_INFO[currentModel];
          const isRecommended = currentModel === metadata.recommended;

          return (
            <div
              key={agentType}
              className={cn(
                'group flex items-start justify-between p-4 rounded-xl transition-all duration-200',
                'border border-border/50 hover:border-border',
                'hover:bg-accent/30'
              )}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    'w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0',
                    modelInfo.colorClass.replace('text-', 'bg-').replace('-500', '-500/10')
                  )}
                >
                  <div className={modelInfo.colorClass}>{AGENT_ICONS[agentType]}</div>
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="font-medium text-foreground">{metadata.label}</Label>
                    {isRecommended && (
                      <Badge variant="secondary" className="text-xs">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{metadata.description}</p>
                </div>
              </div>

              {/* Model Selector */}
              <div className="flex gap-1.5 shrink-0 ml-4">
                {CLAUDE_MODELS.map((modelOption) => {
                  const modelId = modelOption.id as AgentModel;
                  const isSelected = currentModel === modelId;
                  const isEnabled =
                    modelId === 'haiku'
                      ? metadata.canUseHaiku
                      : modelId === 'opus'
                        ? metadata.canUseOpus
                        : true;

                  return (
                    <button
                      key={modelId}
                      type="button"
                      onClick={() => isEnabled && handleModelChange(agentType, modelId)}
                      disabled={!isEnabled}
                      title={
                        modelOption.description +
                        (isEnabled ? '' : ' (not recommended for this agent)')
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm font-medium transition-all min-w-[70px]',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                      )}
                      data-testid={`agent-${agentType}-model-${modelId}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{modelOption.label}</span>
                        {isSelected && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {modelOption.badge}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cost Information */}
      <div className="px-6 pb-6">
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-500" />
            Cost Optimization Tips
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>
              • Use <strong className="text-foreground">Haiku</strong> for high-volume tasks like
              testing (80% cost savings)
            </li>
            <li>
              • Use <strong className="text-foreground">Sonnet</strong> for most development work
              (best balance)
            </li>
            <li>
              • Use <strong className="text-foreground">Opus</strong> only for complex architectural
              decisions or critical review
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
