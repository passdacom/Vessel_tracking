export function validateHistoryPassword(password) {
  return String(password || "").trim() ? "" : "히스토리 조회 비밀번호를 입력해주세요.";
}

export function buildHistoryRequestBody(days, password) {
  return {
    days,
    password: String(password || "").trim(),
  };
}
