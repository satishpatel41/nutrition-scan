import { randomUUID } from 'node:crypto';
import type { Assessment, ExtractedLabel } from './domain/types.js';

export interface UserRec { id: string; email: string; passwordHash: string }
export type ScanStatus = 'EXTRACTED' | 'NEEDS_NUTRITION_LABEL' | 'CORRECTED';
export interface ScanRec {
  id: string;
  userId: string;
  status: ScanStatus;
  source: 'provider' | 'manual';
  label: ExtractedLabel;
  assessment: Assessment | null;
  corrections: { field: string; oldValue: unknown; newValue: unknown; at: string }[];
  createdAt: string;
}
export interface ReportRec { id: string; userId: string; scanId: string; reason: string; details?: string; createdAt: string }

/** Storage port. InMemoryStore is for dev/tests; a Prisma implementation backs production. */
export interface Store {
  createUser(email: string, passwordHash: string): Promise<UserRec | null>;
  findUserByEmail(email: string): Promise<UserRec | null>;
  saveScan(scan: ScanRec): Promise<ScanRec>;
  getScan(userId: string, id: string): Promise<ScanRec | null>;
  listScans(userId: string): Promise<ScanRec[]>;
  deleteScan(userId: string, id: string): Promise<boolean>;
  deleteAllScans(userId: string): Promise<number>;
  addReport(r: Omit<ReportRec, 'id' | 'createdAt'>): Promise<ReportRec>;
}

export class InMemoryStore implements Store {
  private users = new Map<string, UserRec>();
  private scans = new Map<string, ScanRec>();
  private reports: ReportRec[] = [];

  async createUser(email: string, passwordHash: string) {
    const e = email.toLowerCase();
    if ([...this.users.values()].some((u) => u.email === e)) return null;
    const u = { id: randomUUID(), email: e, passwordHash };
    this.users.set(u.id, u);
    return u;
  }
  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async saveScan(scan: ScanRec) { this.scans.set(scan.id, structuredClone(scan)); return scan; }
  async getScan(userId: string, id: string) {
    const s = this.scans.get(id);
    return s && s.userId === userId ? structuredClone(s) : null;
  }
  async listScans(userId: string) {
    return [...this.scans.values()].filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => structuredClone(s));
  }
  async deleteScan(userId: string, id: string) {
    const s = this.scans.get(id);
    if (!s || s.userId !== userId) return false;
    this.scans.delete(id);
    this.reports = this.reports.filter((r) => r.scanId !== id);
    return true;
  }
  async deleteAllScans(userId: string) {
    let n = 0;
    for (const [id, s] of this.scans) if (s.userId === userId) { this.scans.delete(id); n++; }
    this.reports = this.reports.filter((r) => r.userId !== userId);
    return n;
  }
  async addReport(r: Omit<ReportRec, 'id' | 'createdAt'>) {
    const rec = { ...r, id: randomUUID(), createdAt: new Date().toISOString() };
    this.reports.push(rec);
    return rec;
  }
}
