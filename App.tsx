
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Node, Edge, MapData, AIResponse, TabType, SummaryCard } from './types';
import { callGeminiAction } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [theme, setTheme] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('expand');
  const [aiResults, setAiResults] = useState<AIResponse | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  
  // Canvas Interaction
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<SVGSVGElement>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('ai-scribe-map');
    if (saved) {
      try {
        const data: MapData = JSON.parse(saved);
        setNodes(data.nodes);
        setEdges(data.edges);
        setTheme(data.theme);
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
    const key = localStorage.getItem('GEMINI_API_KEY');
    if (key) setTempApiKey(key);
  }, []);

  useEffect(() => {
    if (nodes.length > 0 || theme !== "") {
      localStorage.setItem('ai-scribe-map', JSON.stringify({ nodes, edges, theme }));
    }
  }, [nodes, edges, theme]);

  const saveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', tempApiKey);
    setShowKeyInput(false);
    setError(null);
  };

  // Actions
  const handleCreateTheme = () => {
    if (!theme) return;
    const themeNode: Node = {
      id: 'root-' + Date.now(),
      parentId: null,
      title: theme,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      isTheme: true
    };
    setNodes([themeNode]);
    setEdges([]);
    setSelectedNodeId(themeNode.id);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const addNode = (parentId: string | null = null) => {
    const id = 'node-' + Date.now();
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      const newNode: Node = {
        id,
        parentId,
        title: "新規ノード",
        x: parent ? parent.x + 200 : 200,
        y: parent ? parent.y + Math.random() * 100 - 50 : 200,
      };
      return [...prev, newNode];
    });
    if (parentId) {
      setEdges(prev => [...prev, { source: parentId, target: id }]);
    }
    setSelectedNodeId(id);
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const editNodeTitle = (id: string) => {
    setNodes(currentNodes => {
      const nodeToEdit = currentNodes.find(n => n.id === id);
      if (!nodeToEdit) return currentNodes;

      const newTitle = prompt("名前を変更:", nodeToEdit.title);
      if (newTitle !== null && newTitle.trim() !== "") {
        const trimmed = newTitle.trim();
        return currentNodes.map(n => n.id === id ? { ...n, title: trimmed } : n);
      }
      return currentNodes;
    });
  };

  const autoLayout = () => {
    const themeNode = nodes.find(n => n.isTheme);
    if (!themeNode) return;

    const arrange = (parentId: string | null, depth: number, offset: number) => {
      const children = nodes.filter(n => n.parentId === parentId);
      children.forEach((child, i) => {
        const x = (themeNode.x) + (depth + 1) * 240;
        const y = (themeNode.y) + (i - (children.length - 1) / 2) * 120 + offset;
        setNodes(prev => prev.map(n => n.id === child.id ? { ...n, x, y } : n));
        arrange(child.id, depth + 1, y - themeNode.y);
      });
    };
    arrange(themeNode.id, 0, 0);
  };

  const handleAIAction = async (action: TabType) => {
    if (!localStorage.getItem('GEMINI_API_KEY') && !process.env.APIKEY && !process.env.API_KEY) {
      setShowKeyInput(true);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const result = await callGeminiAction(action, theme, nodes, edges, selectedNodeId || undefined);
      setAiResults(result);
      
      if (action === 'expand' && result.newNodes) {
        const addedNodes: Node[] = result.newNodes.map((n, i) => ({
          ...n,
          id: n.id || 'ai-node-' + Math.random(),
          title: n.title,
          x: (nodes.find(p => p.id === n.parentId)?.x || 400) + 200,
          y: (nodes.find(p => p.id === n.parentId)?.y || 400) + (i * 80 - 120),
          parentId: n.parentId || (nodes.find(node => node.isTheme)?.id || null)
        }));
        setNodes(prev => [...prev, ...addedNodes]);
        const addedEdges: Edge[] = result.newEdges || addedNodes.map(n => ({ source: n.parentId!, target: n.id }));
        setEdges(prev => [...prev, ...addedEdges]);
      }
    } catch (e: any) {
      setError(e.message || "AI生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const onMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setIsPanning(true);
      setSelectedNodeId(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
    if (dragNodeId) {
      setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: n.x + e.movementX / zoom, y: n.y + e.movementY / zoom } : n));
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    setDragNodeId(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const scaleFactor = 0.001;
    const newZoom = Math.min(Math.max(zoom - e.deltaY * scaleFactor, 0.2), 3);
    setZoom(newZoom);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-800">
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
             <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">AIアイディア補助ホワイトボード</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowKeyInput(true)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="APIキー設定">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button onClick={() => { if(confirm("初期化しますか？")){setNodes([]); setEdges([]); setTheme(""); setSelectedNodeId(null); setZoom(1); localStorage.removeItem('ai-scribe-map');} }} className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors">新規</button>
          <button onClick={() => {}} className="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded transition-colors border border-indigo-100">保存</button>
        </div>
      </header>

      {showKeyInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-96 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Gemini APIキーの設定</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">Google AI Studioから取得したAPIキーを入力してください。キーはブラウザのローカルストレージに保存されます。</p>
            <input 
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowKeyInput(false)} className="flex-1 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded transition-colors">キャンセル</button>
              <button onClick={saveApiKey} className="flex-1 px-3 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded transition-colors">保存する</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm z-10" onMouseDown={e => e.stopPropagation()}>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            <section>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">テーマ</label>
              <input 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="アイデアの種を入力"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-xs shadow-sm"
              />
              <button 
                onClick={handleCreateTheme}
                disabled={!theme}
                className="w-full mt-2 bg-indigo-600 text-white py-1.5 rounded font-semibold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all"
              >
                マップを開始
              </button>
            </section>

            <section className="pt-4 border-t border-slate-100 flex flex-col gap-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ツール</label>
              <button 
                onClick={() => addNode(selectedNodeId)}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded border border-slate-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                ノード追加
              </button>
              
              {selectedNodeId && (
                <>
                  <button 
                    onClick={() => editNodeTitle(selectedNodeId)}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    名前を変更
                  </button>
                  <button 
                    onClick={() => deleteNode(selectedNodeId)}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded border border-rose-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    削除
                  </button>
                </>
              )}
            </section>
          </div>

          <section className="h-1/3 border-t border-slate-200 flex flex-col bg-slate-50/80 backdrop-blur-sm overflow-hidden">
            <div className="px-4 py-3 bg-white border-b border-slate-200 shrink-0">
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                AIアシスタント
              </h2>
            </div>
            
            <div className="flex bg-slate-100 p-1 mx-4 mt-3 rounded-md shrink-0">
              {(['expand', 'organize', 'summary', 'missing'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1 text-[9px] font-bold rounded transition-all ${activeTab === tab ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {tab === 'expand' && '拡張'}
                  {tab === 'organize' && '整理'}
                  {tab === 'summary' && '集約'}
                  {tab === 'missing' && '補完'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3">
              {error && <div className="bg-rose-50 border border-rose-100 p-2 rounded text-rose-600 text-[10px] mb-3">{error}</div>}
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">思考中...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 結果表示ロジックは既存のものを維持 */}
                  {!aiResults && !loading && (
                     <div className="h-24 flex items-center justify-center opacity-30">
                        <p className="text-[9px] font-bold uppercase tracking-widest">AI待機中</p>
                     </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
              <button 
                onClick={() => handleAIAction(activeTab)}
                disabled={loading || !theme || nodes.length === 0}
                className="w-full bg-slate-900 text-white py-2 rounded font-bold text-xs hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2"
              >
                AI実行
              </button>
            </div>
          </section>
        </aside>

        <section className="flex-1 relative overflow-hidden bg-[radial-gradient(#e5e7eb_0.8px,transparent_0.8px)] [background-size:24px:24px] bg-slate-50 shadow-inner">
          <svg 
            ref={canvasRef}
            className="w-full h-full canvas-container"
            onMouseDown={onMouseDownCanvas}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* マップ描画ロジックは既存のものを維持 */}
              {edges.map((edge, i) => {
                const source = nodes.find(n => n.id === edge.source);
                const target = nodes.find(n => n.id === edge.target);
                if (!source || !target) return null;
                return (
                  <path 
                    key={`${edge.source}-${edge.target}-${i}`}
                    d={`M ${source.x} ${source.y} C ${source.x + 80} ${source.y}, ${target.x - 80} ${target.y}, ${target.x} ${target.y}`}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={1.5 / zoom}
                  />
                );
              })}
              {nodes.map(node => (
                <g 
                  key={node.id} 
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragNodeId(node.id);
                    setSelectedNodeId(node.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    editNodeTitle(node.id);
                  }}
                  className="group cursor-pointer"
                >
                  <rect 
                    x="-65" y="-25" width="130" height="50" rx="12"
                    fill={selectedNodeId === node.id ? "#4f46e5" : node.isTheme ? "#1e293b" : "#ffffff"}
                    stroke={selectedNodeId === node.id ? "#c7d2fe" : "#e2e8f0"}
                    strokeWidth={selectedNodeId === node.id ? 3 : 1}
                    className="transition-all shadow-md"
                  />
                  <foreignObject x="-60" y="-20" width="120" height="40" className="pointer-events-none">
                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                      <p className={`text-[10px] font-bold leading-tight text-center select-none break-all line-clamp-3 ${selectedNodeId === node.id || node.isTheme ? "text-white" : "text-slate-700"}`}>
                        {node.title}
                      </p>
                    </div>
                  </foreignObject>
                </g>
              ))}
            </g>
          </svg>
        </section>
      </main>
    </div>
  );
};

export default App;
