// Lets REST/lifecycle code (match, block, unmatch, account deletion) notify the realtime layer after a commit
// without importing it. A no-op until realtime is attached, so tests and scripts need no socket server.
export interface ChatHub {
  closed(matchId: string, userIds: string[]): void;
  inbox(userIds: string[]): void;
  disconnect(userId: string): void;
}
let hub: ChatHub | null = null;
export const setChatHub = (h: ChatHub | null) => { hub = h; };
export const chatHub: ChatHub = {
  closed: (m, u) => hub?.closed(m, u),
  inbox: (u) => hub?.inbox(u),
  disconnect: (u) => hub?.disconnect(u),
};
