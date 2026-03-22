import React, { useState, useMemo } from "react";

const GroupManageModal = ({ vessels, onUpdateVessel, onClose, customGroups = [], onAddGroup, onRenameGroup, onDeleteGroup }) => {
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingName, setEditingName] = useState("");

  // Extract unique groups from vessels and add customGroups
  const groups = useMemo(() => {
    const groupSet = new Set(["자사간사", "타사간사", ...customGroups]);
    vessels.forEach(v => {
      if (v.companyType) groupSet.add(v.companyType);
    });
    return Array.from(groupSet).sort();
  }, [vessels, customGroups]);

  const [selectedGroup, setSelectedGroup] = useState(groups[0] || "자사간사");

  // Update selectedGroup if it disappears (e.g., last vessel moved out)
  if (!groups.includes(selectedGroup) && groups.length > 0) {
    setSelectedGroup(groups[0]);
  }

  const vesselsInGroup = vessels.filter(v => (v.companyType || "자사간사") === selectedGroup);

  const handleCreateGroup = (e) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    
    if (onAddGroup) {
      onAddGroup(trimmed);
      setNewGroupName("");
      setSelectedGroup(trimmed);
    }
  };

  const handleRenameSubmit = (oldName) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== oldName && onRenameGroup) {
      onRenameGroup(oldName, trimmed);
      if (selectedGroup === oldName) {
        setSelectedGroup(trimmed);
      }
    }
    setEditingGroup(null);
  };

  const handleDeleteClick = (g, e) => {
    e.stopPropagation();
    if (window.confirm(`'${g}' 그룹을 정말 삭제하시겠습니까?\n이 그룹에 속한 선박은 '자사간사'로 이동됩니다.`)) {
      if (onDeleteGroup) {
        onDeleteGroup(g);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h2 className="text-lg font-bold">📂 그룹 관리</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black p-1 text-xl leading-none">
            &times;
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden min-h-[400px]">
          {/* Left Panel: Group List */}
          <div className="w-1/3 border-r flex flex-col bg-gray-50">
            <div className="p-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">그룹 목록</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {groups.map(g => {
                const count = vessels.filter(v => (v.companyType || "자사간사") === g).length;
                const isEditing = editingGroup === g;

                return (
                  <div key={g}
                    className={`group w-full text-left px-3 py-2 rounded mb-1 text-sm flex justify-between items-center cursor-pointer ${
                      selectedGroup === g ? "bg-blue-100 text-blue-800 font-semibold" : "hover:bg-gray-200 text-gray-700"
                    }`}
                    onClick={() => {
                      if (!isEditing) setSelectedGroup(g);
                    }}
                  >
                    {isEditing ? (
                      <div className="flex w-full items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSubmit(g);
                            if (e.key === "Escape") setEditingGroup(null);
                          }}
                          className="w-full text-sm border rounded px-1 py-0.5 font-normal"
                        />
                        <button onClick={() => handleRenameSubmit(g)} className="text-blue-600 font-bold px-1">✓</button>
                        <button onClick={() => setEditingGroup(null)} className="text-gray-500 font-bold px-1">✕</button>
                      </div>
                    ) : (
                      <>
                        <span className="truncate pr-2">{g}</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs flex-shrink-0">{count}</span>
                          <div className="hidden group-hover:flex items-center opacity-70">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingGroup(g);
                                setEditingName(g);
                              }}
                              className="text-gray-600 hover:text-blue-600 px-1"
                              title="수정"
                            >✏️</button>
                            <button 
                              onClick={(e) => handleDeleteClick(g, e)}
                              className="text-gray-600 hover:text-red-500 px-1"
                              title="삭제"
                            >🗑️</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Add Group */}
            <div className="p-3 border-t border-gray-200 bg-gray-100">
              <form onSubmit={handleCreateGroup} className="flex gap-2 relative">
                <input 
                  type="text" 
                  value={newGroupName} 
                  onChange={(e) => setNewGroupName(e.target.value)} 
                  placeholder="새 그룹명 입력" 
                  className="flex-1 text-sm px-2 py-1.5 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 font-semibold shadow-sm">+</button>
              </form>
            </div>
          </div>

          {/* Right Panel: Vessels in Selected Group */}
          <div className="w-2/3 flex flex-col bg-white">
            <div className="p-3 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-700">
                {selectedGroup} <span className="text-sm font-normal text-gray-500">({vesselsInGroup.length}척)</span>
              </h3>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4">
              {vesselsInGroup.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">이 그룹에 선박이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {vesselsInGroup.map(v => (
                    <div key={v.id} className="flex justify-between items-center p-3 border rounded hover:border-blue-300 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color || '#3b82f6' }}></div>
                        <div>
                          <p className="font-medium text-sm">{v.alias || v.mmsi}</p>
                          <p className="text-xs text-gray-500">MMSI: {v.mmsi}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <select
                          className="text-sm border rounded p-1.5 bg-gray-50 focus:ring-blue-500"
                          value={selectedGroup}
                          onChange={(e) => {
                            if (e.target.value === 'new_group_prompt') {
                              const newName = prompt("새 그룹 이름을 입력하세요:");
                              if (newName && newName.trim()) {
                                onUpdateVessel(v.id, { companyType: newName.trim() });
                              }
                            } else if (e.target.value !== selectedGroup) {
                              onUpdateVessel(v.id, { companyType: e.target.value });
                            }
                          }}
                        >
                          {groups.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                          <option disabled>──────────</option>
                          <option value="new_group_prompt">+ 새 그룹으로 이동...</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupManageModal;
