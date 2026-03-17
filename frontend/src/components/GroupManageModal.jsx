import React, { useState, useMemo } from "react";

const GroupManageModal = ({ vessels, onUpdateVessel, onClose }) => {
  const [newGroupName, setNewGroupName] = useState("");

  // Extract unique groups from vessels
  const groups = useMemo(() => {
    const groupSet = new Set();
    vessels.forEach(v => {
      if (v.companyType) groupSet.add(v.companyType);
    });
    // Ensure default groups exist if we want them, otherwise just what's in vessels
    if (groupSet.size === 0) {
      groupSet.add("자사간사");
      groupSet.add("타사간사");
    }
    return Array.from(groupSet).sort();
  }, [vessels]);

  const [selectedGroup, setSelectedGroup] = useState(groups[0] || "");

  // Update selectedGroup if it disappears (e.g., last vessel moved out)
  if (!groups.includes(selectedGroup) && groups.length > 0) {
    setSelectedGroup(groups[0]);
  }

  const vesselsInGroup = vessels.filter(v => (v.companyType || "자사간사") === selectedGroup);

  const handleCreateGroup = (e) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    
    // We can't immediately create an empty group based on DB because it relies on vessels.
    // Instead, "Add Group" is more of a visual thing, or we just instruct users to move ships.
    // But since the UI has "+ Add Group", let's handle it by creating a temporary empty group state
    // Actually, the prompt says "+ 그룹 추가 → 인라인 입력창으로 새 그룹명 등록". 
    // And "신규 그룹 = 새 그룹명으로 선박을 이동시키면 자동 생성".
    // Let's stick with moving a ship creates a group. 
    // Wait, the plan says "+ 그룹 추가" is an inline input. Let's add a visual-only group for now if they type one.
    // However, it's easier to just move ships to a new group name.
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
                return (
                  <button
                    key={g}
                    onClick={() => setSelectedGroup(g)}
                    className={`w-full text-left px-3 py-2 rounded mb-1 text-sm flex justify-between items-center ${
                      selectedGroup === g ? "bg-blue-100 text-blue-800 font-semibold" : "hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    <span className="truncate pr-2">{g}</span>
                    <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs flex-shrink-0">{count}</span>
                  </button>
                );
              })}
            </div>
            {/* Group Addition (Informational or Temporary) */}
            <div className="p-3 border-t border-gray-200 text-xs text-gray-500 text-center">
              * 새 그룹은 선박 이동 시<br/>이름을 입력하여 생성합니다.
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
