import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Settings, Workflow, Trash2, Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// Local types for pipeline configuration dialog
interface PipelineStage {
  id: string;
  name: string;
  color: string;
  agentTypes: string[];
}

interface Pipeline {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

interface PipelineConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline | null;
  onSave: (pipeline: Pipeline) => void;
  onDelete?: (pipelineId: string) => void;
}

export function PipelineConfigDialog({
  open,
  onOpenChange,
  pipeline,
  onSave,
  onDelete,
}: PipelineConfigDialogProps) {
  const isEditing = pipeline !== null;
  const [name, setName] = useState(pipeline?.name || '');
  const [description, setDescription] = useState(pipeline?.description || '');
  const [isEnabled, setIsEnabled] = useState(pipeline?.isEnabled ?? true);
  const [stages, setStages] = useState<PipelineStage[]>(
    pipeline?.stages || [
      { id: '1', name: 'Planning', color: '#3b82f6', agentTypes: ['planning'] },
      { id: '2', name: 'Implementation', color: '#10b981', agentTypes: ['implementation'] },
      { id: '3', name: 'Testing', color: '#f59e0b', agentTypes: ['testing'] },
    ]
  );
  const [activeStageId, setActiveStageId] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) {
      return;
    }

    const pipelineData: Pipeline = {
      id: pipeline?.id || `pipeline-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      isEnabled,
      stages,
      createdAt: pipeline?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(pipelineData);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (pipeline && onDelete) {
      onDelete(pipeline.id);
      onOpenChange(false);
    }
  };

  const addStage = () => {
    const newStage: PipelineStage = {
      id: `stage-${Date.now()}`,
      name: 'New Stage',
      color: '#6366f1',
      agentTypes: [],
    };
    setStages([...stages, newStage]);
    setActiveStageId(newStage.id);
  };

  const updateStage = (stageId: string, updates: Partial<PipelineStage>) => {
    setStages(stages.map((stage) => (stage.id === stageId ? { ...stage, ...updates } : stage)));
  };

  const deleteStage = (stageId: string) => {
    setStages(stages.filter((stage) => stage.id !== stageId));
    if (activeStageId === stageId) {
      setActiveStageId(null);
    }
  };

  const activeStage = stages.find((stage) => stage.id === activeStageId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Pipeline' : 'Create Pipeline'}</DialogTitle>
          <DialogDescription>
            Configure a custom pipeline with stages for your development workflow.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="general">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="stages">
              <Workflow className="w-4 h-4 mr-2" />
              Stages
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="pipeline-name">Pipeline Name</Label>
              <Input
                id="pipeline-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Custom Development Pipeline"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pipeline-description">Description</Label>
              <Textarea
                id="pipeline-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this pipeline..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div className="space-y-0.5">
                <Label htmlFor="pipeline-enabled">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  When disabled, this pipeline won't be available for new features
                </p>
              </div>
              <Switch id="pipeline-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </TabsContent>

          {/* Stages Tab */}
          <TabsContent value="stages" className="flex-1 min-h-0 flex gap-4 overflow-hidden">
            {/* Stage List */}
            <div className="w-1/2 space-y-2 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <Label>Stages</Label>
                <Button type="button" variant="outline" size="sm" onClick={addStage}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Stage
                </Button>
              </div>

              {stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStageId(stage.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                    'hover:bg-accent/50',
                    activeStageId === stage.id
                      ? 'bg-accent border-primary/50'
                      : 'bg-background border-border'
                  )}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{stage.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {stage.agentTypes.length > 0
                        ? `${stage.agentTypes.length} agent type(s)`
                        : 'No agents assigned'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStage(stage.id);
                    }}
                    disabled={stages.length <= 1}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </button>
              ))}
            </div>

            {/* Stage Editor */}
            <div className="w-1/2 border-l border-border pl-4 overflow-y-auto">
              {activeStage ? (
                <StageConfigurator
                  stage={activeStage}
                  onUpdate={(updates) => updateStage(activeStage.id, updates)}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a stage to edit
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="sm:!justify-between">
          {isEditing && onDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Pipeline
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleSave}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={open}
              disabled={!name.trim()}
            >
              {isEditing ? 'Save Changes' : 'Create Pipeline'}
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StageConfiguratorProps {
  stage: PipelineStage;
  onUpdate: (updates: Partial<PipelineStage>) => void;
}

function StageConfigurator({ stage, onUpdate }: StageConfiguratorProps) {
  const [agentTypeInput, setAgentTypeInput] = useState('');

  const addAgentType = () => {
    if (agentTypeInput.trim() && !stage.agentTypes.includes(agentTypeInput.trim())) {
      onUpdate({
        agentTypes: [...stage.agentTypes, agentTypeInput.trim()],
      });
      setAgentTypeInput('');
    }
  };

  const removeAgentType = (agentType: string) => {
    onUpdate({
      agentTypes: stage.agentTypes.filter((t: string) => t !== agentType),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="stage-name">Stage Name</Label>
        <Input
          id="stage-name"
          value={stage.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g., Planning"
        />
      </div>

      <div className="space-y-2">
        <Label>Stage Color</Label>
        <PipelineColorPicker color={stage.color} onChange={(color) => onUpdate({ color })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-types">Agent Types</Label>
        <div className="flex gap-2">
          <Input
            id="agent-types"
            value={agentTypeInput}
            onChange={(e) => setAgentTypeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAgentType();
              }
            }}
            placeholder="e.g., planning"
          />
          <Button type="button" variant="outline" onClick={addAgentType}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {stage.agentTypes.map((agentType: string) => (
            <div
              key={agentType}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm border border-primary/20"
            >
              {agentType}
              <button
                type="button"
                onClick={() => removeAgentType(agentType)}
                className="hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PipelineColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function PipelineColorPicker({ color, onChange }: PipelineColorPickerProps) {
  const predefinedColors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {predefinedColors.map((presetColor) => (
          <button
            key={presetColor}
            type="button"
            onClick={() => onChange(presetColor)}
            className={cn(
              'w-8 h-8 rounded-md border-2 transition-all',
              'hover:scale-110 hover:shadow-md',
              color === presetColor ? 'border-ring shadow-md ring-2 ring-ring/20' : 'border-border'
            )}
            style={{ backgroundColor: presetColor }}
            aria-label={`Select color ${presetColor}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-md border-2 border-border"
          style={{ backgroundColor: color }}
        />
        <Input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 h-9 p-0.5 cursor-pointer"
        />
        <Input
          type="text"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}
