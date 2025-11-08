const API_BASE_URL = 'http://localhost:8000';
const absoluteUrl = (path?: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
};

export interface Poll {
  id: string;
  title: string;
  description?: string;
  deadlineISO?: string;
  type: 'single' | 'multi';
  variants: Array<{ id: string; label: string }>;
  maxSelections: number;
  isAnonymous: boolean;
  ownerUserId?: string | null;
}

export interface PollCreate {
  title: string;
  description?: string;
  deadlineISO?: string;
  type: 'single' | 'multi';
  variants: string[];
  maxSelections?: number;
  isAnonymous?: boolean;
  ownerUserId?: string | null;
}

export interface VoteRequest {
  userId: string;
  choices: string[];
}

export interface VoteResult {
  pollId: string;
  total: number;
  results: Array<{
    id: string;
    label: string;
    count: number;
    voters?: Array<{
      id: string;
      username: string | null;
      name: string;
      avatarUrl?: string | null;
    }>;
  }>;
  isAnonymous: boolean;
  totalVoters: number;
  participationRate: number;
}

export class PollApiService {
  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  static async getPolls(): Promise<Poll[]> {
    return this.request<Poll[]>('/polls');
  }

  static async getPoll(pollId: string): Promise<Poll> {
    return this.request<Poll>(`/polls/${pollId}`);
  }

  static async createPoll(poll: PollCreate): Promise<Poll> {
    return this.request<Poll>('/polls', {
      method: 'POST',
      body: JSON.stringify(poll),
    });
  }

  static async deletePoll(pollId: string): Promise<{ status: string; message: string }> {
    // Header X-User-Id will be set by callers via fetch wrapper if needed
    return this.request<{ status: string; message: string }>(`/polls/${pollId}`, {
      method: 'DELETE',
      headers: {
        ...(AuthApi.currentUserId() ? { 'X-User-Id': AuthApi.currentUserId()! } : {}),
      }
    });
  }

  static async vote(pollId: string, vote: VoteRequest): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
  }

  static async getResults(pollId: string): Promise<VoteResult> {
    const data = await this.request<VoteResult>(`/polls/${pollId}/results`);
    if (!data.isAnonymous) {
      data.results = data.results.map((item) => ({
        ...item,
        voters: item.voters?.map((voter) => ({
          ...voter,
          avatarUrl: absoluteUrl(voter.avatarUrl) ?? undefined,
        })),
      }));
    }
    return data;
  }
}

// Auth API
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  username: string | null;
  avatarUrl?: string | null;
}

export interface RegisterOptions {
  role?: 'admin' | 'user';
  adminToken?: string;
}

export interface ProfileUpdatePayload {
  email?: string;
  name?: string;
  password?: string;
}

export class AuthApi {
  private static normalizeUser(u: User): User {
    return {
      ...u,
      avatarUrl: absoluteUrl(u.avatarUrl) ?? undefined,
    };
  }

  private static requireUserId(): string {
    const id = this.currentUserId();
    if (!id) {
      throw new Error('User not authenticated');
    }
    return id;
  }

  static async login(username: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return this.normalizeUser(await res.json());
  }

  static async register(
    username: string,
    email: string,
    name: string,
    password: string,
    options?: RegisterOptions
  ): Promise<User> {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (options?.adminToken) {
      headers['X-Admin-Token'] = options.adminToken;
    }
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username,
        email,
        name,
        password,
        role: options?.role ?? 'user',
      }),
    });
    if (!res.ok) throw new Error('Register failed');
    return this.normalizeUser(await res.json());
  }

  static currentUserId(): string | null {
    const raw = localStorage.getItem('auth:user');
    if (!raw) return null;
    try { const u = JSON.parse(raw) as User; return u.id; } catch { return null; }
  }

  static async getProfile(): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/me`, {
      headers: {
        'X-User-Id': this.requireUserId(),
      },
    });
    if (!res.ok) throw new Error('Failed to load profile');
    return this.normalizeUser(await res.json());
  }

  static async updateProfile(payload: ProfileUpdatePayload): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this.requireUserId(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return this.normalizeUser(await res.json());
  }

  static async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/me/avatar`, {
      method: 'POST',
      headers: {
        'X-User-Id': this.requireUserId(),
      },
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload avatar');
    return this.normalizeUser(await res.json());
  }
}
