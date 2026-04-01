export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const AUTH_USER_STORAGE_KEY = 'auth:user';
const AUTH_SESSION_STORAGE_KEY = 'auth:session';

const absoluteUrl = (path?: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
};

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  obtainedAt: number;
}

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event('auth:changed'));
}

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  if (!session) {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    notifyAuthChanged();
    return;
  }
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  notifyAuthChanged();
}

function readUser(): User | null {
  const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function writeUser(user: User | null): void {
  if (!user) {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    notifyAuthChanged();
    return;
  }
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  notifyAuthChanged();
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload.detail === 'string') {
      return payload.detail;
    }
  } catch {
    // no-op
  }
  return `API Error: ${response.status} ${response.statusText}`;
}

class ApiClient {
  private static refreshPromise: Promise<boolean> | null = null;

  private static accessToken(): string | null {
    return readSession()?.accessToken ?? null;
  }

  private static refreshToken(): string | null {
    return readSession()?.refreshToken ?? null;
  }

  static clearAuthState(): void {
    writeSession(null);
    writeUser(null);
  }

  private static async ensureRefreshed(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = AuthApi.refreshSession();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private static withJsonHeaders(headers: Headers, body: BodyInit | null | undefined): Headers {
    if (!headers.has('Content-Type') && body && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  static async rawFetch(
    endpoint: string,
    options: RequestInit = {},
    opts?: { skipAuth?: boolean; retryOnUnauthorized?: boolean }
  ): Promise<Response> {
    const skipAuth = opts?.skipAuth ?? false;
    const retryOnUnauthorized = opts?.retryOnUnauthorized ?? true;

    const headers = new Headers(options.headers ?? {});
    this.withJsonHeaders(headers, options.body);

    if (!skipAuth) {
      const accessToken = this.accessToken();
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !skipAuth && retryOnUnauthorized && this.refreshToken()) {
      const refreshed = await this.ensureRefreshed();
      if (refreshed) {
        return this.rawFetch(endpoint, options, {
          skipAuth,
          retryOnUnauthorized: false,
        });
      }
      this.clearAuthState();
    }

    return response;
  }

  static async request<T>(
    endpoint: string,
    options: RequestInit = {},
    opts?: { skipAuth?: boolean; retryOnUnauthorized?: boolean }
  ): Promise<T> {
    const response = await this.rawFetch(endpoint, options, opts);
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json();
  }
}

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
  userId?: string;
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

export interface PollsResponse {
  items: Poll[];
  total: number;
}

export interface PollAttachment {
  id: string;
  pollId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploaderUserId: string;
  createdAt: string;
  downloadUrl: string;
}

interface PollAttachmentListResponse {
  items: PollAttachment[];
}

const normalizeAttachment = (attachment: PollAttachment): PollAttachment => ({
  ...attachment,
  downloadUrl: absoluteUrl(attachment.downloadUrl) ?? attachment.downloadUrl,
});

export interface WeatherSnapshot {
  city: string;
  condition: string;
  conditionDescription: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  windSpeedMps: number;
  observedAt: string;
  source: string;
  cached: boolean;
}

export class PollApiService {
  private static pollsCache = new Map<string, { expiresAt: number; payload: PollsResponse }>();
  private static readonly POLLS_CACHE_TTL_MS = 15_000;

  private static clearPollsCache(): void {
    this.pollsCache.clear();
  }

  private static toPollsCacheKey(params?: {
    status?: 'all' | 'active' | 'completed' | 'upcoming';
    search?: string;
    isAnonymous?: boolean;
    ownerUserId?: string;
    sortBy?: 'deadline' | 'created' | 'title';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): string {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'all') {
      query.set('status', params.status);
    }
    if (params?.search) {
      query.set('search', params.search);
    }
    if (typeof params?.isAnonymous === 'boolean') {
      query.set('isAnonymous', String(params.isAnonymous));
    }
    if (params?.ownerUserId) {
      query.set('ownerUserId', params.ownerUserId);
    }
    if (params?.sortBy) {
      query.set('sortBy', params.sortBy);
    }
    if (params?.sortOrder) {
      query.set('sortOrder', params.sortOrder);
    }
    if (params?.page) {
      query.set('page', String(params.page));
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    return query.toString();
  }

  static async getPolls(params?: {
    status?: 'all' | 'active' | 'completed' | 'upcoming';
    search?: string;
    isAnonymous?: boolean;
    ownerUserId?: string;
    sortBy?: 'deadline' | 'created' | 'title';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<PollsResponse> {
    const queryString = this.toPollsCacheKey(params);
    const cacheKey = queryString || '__default__';
    const now = Date.now();
    const cached = this.pollsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const payload = await ApiClient.request<PollsResponse>(`/polls${queryString ? `?${queryString}` : ''}`);
    this.pollsCache.set(cacheKey, {
      payload,
      expiresAt: now + this.POLLS_CACHE_TTL_MS,
    });
    return payload;
  }

  static async getPoll(pollId: string): Promise<Poll> {
    return ApiClient.request<Poll>(`/polls/${pollId}`);
  }

  static async createPoll(poll: PollCreate): Promise<Poll> {
    const payload = await ApiClient.request<Poll>('/polls', {
      method: 'POST',
      body: JSON.stringify(poll),
    });
    this.clearPollsCache();
    return payload;
  }

  static async updatePoll(
    pollId: string,
    updatePayload: Partial<{
      title: string;
      description: string;
      deadlineISO: string;
      type: 'single' | 'multi';
      variants: string[];
      maxSelections: number;
      isAnonymous: boolean;
    }>
  ): Promise<Poll> {
    const result = await ApiClient.request<Poll>(`/polls/${pollId}`, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });
    this.clearPollsCache();
    return result;
  }

  static async deletePoll(pollId: string): Promise<{ status: string; message: string }> {
    const payload = await ApiClient.request<{ status: string; message: string }>(`/polls/${pollId}`, {
      method: 'DELETE',
    });
    this.clearPollsCache();
    return payload;
  }

  static async vote(pollId: string, vote: VoteRequest): Promise<{ status: string }> {
    const payload = await ApiClient.request<{ status: string }>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
    this.clearPollsCache();
    return payload;
  }

  static async getResults(pollId: string): Promise<VoteResult> {
    const data = await ApiClient.request<VoteResult>(`/polls/${pollId}/results`);
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

  static async listPollAttachments(pollId: string): Promise<PollAttachment[]> {
    const response = await ApiClient.request<PollAttachmentListResponse>(`/polls/${pollId}/attachments`);
    return response.items.map(normalizeAttachment);
  }

  static async uploadPollAttachment(pollId: string, file: File): Promise<PollAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    const payload = await ApiClient.request<PollAttachment>(`/polls/${pollId}/attachments`, {
      method: 'POST',
      body: formData,
    });
    this.clearPollsCache();
    return normalizeAttachment(payload);
  }

  static async deletePollAttachment(pollId: string, attachmentId: string): Promise<{ status: string }> {
    const payload = await ApiClient.request<{ status: string }>(`/polls/${pollId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
    this.clearPollsCache();
    return payload;
  }

  static async getWeatherSnapshot(city?: string): Promise<WeatherSnapshot> {
    const query = new URLSearchParams();
    if (city?.trim()) {
      query.set('city', city.trim());
    }
    const queryString = query.toString();
    return ApiClient.request<WeatherSnapshot>(
      `/external/weather${queryString ? `?${queryString}` : ''}`,
      {},
      { skipAuth: true, retryOnUnauthorized: false }
    );
  }
}

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  username: string | null;
  avatarUrl?: string | null;
}

export interface RegisterOptions {
  role?: UserRole;
  adminToken?: string;
}

export interface ProfileUpdatePayload {
  email?: string;
  name?: string;
  password?: string;
}

interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

interface AuthResponse {
  user: User;
  tokens: TokenPairResponse;
}

export class AuthApi {
  private static normalizeUser(u: User): User {
    return {
      ...u,
      avatarUrl: absoluteUrl(u.avatarUrl) ?? undefined,
    };
  }

  private static storeAuthPayload(payload: AuthResponse): User {
    const user = this.normalizeUser(payload.user);
    writeUser(user);
    writeSession({
      ...payload.tokens,
      obtainedAt: Date.now(),
    });
    return user;
  }

  static currentUser(): User | null {
    return readUser();
  }

  static hasSession(): boolean {
    return !!readSession()?.accessToken;
  }

  static clearSession(): void {
    ApiClient.clearAuthState();
  }

  static async login(username: string, password: string): Promise<User> {
    const payload = await ApiClient.request<AuthResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      { skipAuth: true }
    );
    return this.storeAuthPayload(payload);
  }

  static async register(
    username: string,
    email: string,
    name: string,
    password: string,
    options?: RegisterOptions
  ): Promise<User> {
    const headers: HeadersInit = {};
    if (options?.adminToken) {
      headers['X-Admin-Token'] = options.adminToken;
    }

    await ApiClient.request<User>(
      '/auth/register',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username,
          email,
          name,
          password,
          role: options?.role ?? 'user',
        }),
      },
      { skipAuth: true }
    );

    return this.login(username, password);
  }

  static async refreshSession(): Promise<boolean> {
    const refreshToken = readSession()?.refreshToken;
    if (!refreshToken) return false;

    try {
      const payload = await ApiClient.request<AuthResponse>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        },
        { skipAuth: true, retryOnUnauthorized: false }
      );
      this.storeAuthPayload(payload);
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  static async logout(): Promise<void> {
    const refreshToken = readSession()?.refreshToken;
    if (refreshToken) {
      try {
        await ApiClient.request<{ status: string }>(
          '/auth/logout',
          {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          },
          { skipAuth: true, retryOnUnauthorized: false }
        );
      } catch {
        // no-op: local logout still happens
      }
    }
    this.clearSession();
  }

  static async getProfile(): Promise<User> {
    const user = await ApiClient.request<User>('/me');
    const normalized = this.normalizeUser(user);
    writeUser(normalized);
    return normalized;
  }

  static async updateProfile(payload: ProfileUpdatePayload): Promise<User> {
    const user = await ApiClient.request<User>('/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const normalized = this.normalizeUser(user);
    writeUser(normalized);
    return normalized;
  }

  static async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('file', file);
    const user = await ApiClient.request<User>('/me/avatar', {
      method: 'POST',
      body: formData,
    });
    const normalized = this.normalizeUser(user);
    writeUser(normalized);
    return normalized;
  }

  static async listUsers(): Promise<User[]> {
    const users = await ApiClient.request<User[]>('/users');
    return users.map((user) => this.normalizeUser(user));
  }

  static async updateUserRole(userId: string, role: UserRole): Promise<User> {
    const user = await ApiClient.request<User>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    return this.normalizeUser(user);
  }

  static async deleteUser(userId: string): Promise<{ status: string }> {
    return ApiClient.request<{ status: string }>(`/users/${userId}`, {
      method: 'DELETE',
    });
  }
}
