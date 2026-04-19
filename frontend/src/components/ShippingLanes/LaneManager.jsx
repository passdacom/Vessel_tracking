import React, { useState } from "react";
import LaneList from "./LaneList.jsx";
import LaneEditor from "./LaneEditor.jsx";

/**
 * LaneManager — 항로 목록(LaneList) ↔ 항로 에디터(LaneEditor) 상태 관리
 *
 * Props:
 *   apiFetch      — authenticated fetch helper from App.jsx
 *   onClose       — 항로 관리 종료 콜백 (Admin Dashboard로 복귀)
 *   onLaneSaved   — 항로 저장/수정 완료 시 콜백 (App.jsx lanes 상태 갱신용)
 */
export default function LaneManager({ apiFetch, onClose, onLaneSaved }) {
  const [view, setView] = useState("list");
  const [editingLane, setEditingLane] = useState(null);

  const handleNew = () => {
    setEditingLane(null);
    setView("editor");
  };

  const handleEdit = (lane) => {
    setEditingLane(lane);
    setView("editor");
  };

  const handleEditorClose = () => {
    setEditingLane(null);
    setView("list");
  };

  const handleSaved = (savedLane) => {
    // 저장 후 목록으로 돌아가기
    setEditingLane(null);
    setView("list");
    // App.jsx lanes 상태 갱신 (메인 지도에 즉시 반영)
    if (onLaneSaved) onLaneSaved(savedLane);
  };

  if (view === "editor") {
    return (
      <LaneEditor
        apiFetch={apiFetch}
        initialLane={editingLane}
        onSave={handleSaved}
        onCancel={handleEditorClose}
      />
    );
  }

  return (
    <LaneList
      apiFetch={apiFetch}
      onNew={handleNew}
      onEdit={handleEdit}
      onClose={onClose}
    />
  );
}
