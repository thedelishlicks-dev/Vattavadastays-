// Simple mock auth using localStorage. Phase 1, frontend-only.
const KEY = "bleaf_admin_auth";

export const MOCK_OWNER = {
  name: "Raju Thomas",
  phone: "9876543210",
  password: "1234",
  property: "Bleaf Mud House",
};

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function login(phone: string, password: string): boolean {
  if (phone.trim() === MOCK_OWNER.phone && password === MOCK_OWNER.password) {
    window.localStorage.setItem(KEY, "1");
    return true;
  }
  return false;
}

export function logout() {
  window.localStorage.removeItem(KEY);
}
