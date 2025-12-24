import { useCallback, useMemo } from 'react';
import dagre from 'dagre';
import { useReactFlow } from '@xyflow/react';
import { TaskNode, DependencyEdge } from './use-graph-nodes';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;

interface UseGraphLayoutProps {
  nodes: TaskNode[];
  edges: DependencyEdge[];
}

/**
 * Applies dagre layout to position nodes in a hierarchical DAG
 * Dependencies flow left-to-right
 */
export function useGraphLayout({ nodes, edges }: UseGraphLayoutProps) {
  const { fitView, setNodes } = useReactFlow();

  const getLayoutedElements = useCallback(
    (
      inputNodes: TaskNode[],
      inputEdges: DependencyEdge[],
      direction: 'LR' | 'TB' = 'LR'
    ): { nodes: TaskNode[]; edges: DependencyEdge[] } => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));

      const isHorizontal = direction === 'LR';
      dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 50,
        ranksep: 100,
        marginx: 50,
        marginy: 50,
      });

      inputNodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      });

      inputEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const layoutedNodes = inputNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
          ...node,
          position: {
            x: nodeWithPosition.x - NODE_WIDTH / 2,
            y: nodeWithPosition.y - NODE_HEIGHT / 2,
          },
          targetPosition: isHorizontal ? 'left' : 'top',
          sourcePosition: isHorizontal ? 'right' : 'bottom',
        } as TaskNode;
      });

      return { nodes: layoutedNodes, edges: inputEdges };
    },
    []
  );

  // Initial layout
  const layoutedElements = useMemo(() => {
    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }
    return getLayoutedElements(nodes, edges, 'LR');
  }, [nodes, edges, getLayoutedElements]);

  // Manual re-layout function
  const runLayout = useCallback(
    (direction: 'LR' | 'TB' = 'LR') => {
      const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges, direction);
      setNodes(layoutedNodes);
      // Fit view after layout with a small delay to allow DOM updates
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
    },
    [nodes, edges, getLayoutedElements, setNodes, fitView]
  );

  return {
    layoutedNodes: layoutedElements.nodes,
    layoutedEdges: layoutedElements.edges,
    runLayout,
  };
}
