import { http, HttpResponse } from 'msw';

const baseURL = 'http://localhost:4000/api';

export const handlers = [
  // Auth endpoints
  http.post(`${baseURL}/auth/login`, async ({ request }) => {
    const { username, password } = await request.json();

    if (username === 'testuser' && password === 'testpassword') {
      return HttpResponse.json({
        success: true,
        token: 'mock-jwt-token',
        user: {
          id: 1,
          username: 'testuser',
          displayName: 'Test User',
          role: 'user',
        },
      });
    }

    return HttpResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  http.post(`${baseURL}/auth/logout`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.get(`${baseURL}/auth/me`, ({ request }) => {
    const token = request.headers.get('Authorization');

    if (token === 'Bearer mock-jwt-token') {
      return HttpResponse.json({
        success: true,
        user: {
          id: 1,
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'user',
        },
      });
    }

    return HttpResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }),

  // Comments endpoints
  http.get(`${baseURL}/comments`, ({ request }) => {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const mockComments = [
      {
        id: 1,
        content: 'Great video!',
        author: 'User1',
        platform: 'youtube',
        timestamp: new Date().toISOString(),
        status: 'approved',
      },
      {
        id: 2,
        content: 'Interesting stream',
        author: 'User2',
        platform: 'twitch',
        timestamp: new Date().toISOString(),
        status: 'pending',
      },
      {
        id: 3,
        content: 'Thanks for sharing',
        author: 'User3',
        platform: 'youtube',
        timestamp: new Date().toISOString(),
        status: 'approved',
      },
    ];

    let filteredComments = mockComments;
    if (platform) {
      filteredComments = mockComments.filter((c) => c.platform === platform);
    }

    return HttpResponse.json({
      success: true,
      comments: filteredComments.slice(0, limit),
      total: filteredComments.length,
    });
  }),

  http.post(`${baseURL}/comments`, async ({ request }) => {
    const body = await request.json();

    return HttpResponse.json({
      success: true,
      comment: {
        id: Date.now(),
        ...body,
        timestamp: new Date().toISOString(),
        status: 'pending',
      },
    });
  }),

  http.put(`${baseURL}/comments/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json();

    return HttpResponse.json({
      success: true,
      comment: {
        id: parseInt(id),
        ...body,
        updatedAt: new Date().toISOString(),
      },
    });
  }),

  http.delete(`${baseURL}/comments/:id`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      message: `Comment ${params.id} deleted`,
    });
  }),

  // Moderation endpoints
  http.post(`${baseURL}/comments/:id/moderate`, async ({ params, request }) => {
    const { id } = params;
    const { action } = await request.json();

    return HttpResponse.json({
      success: true,
      comment: {
        id: parseInt(id),
        status: action === 'approve' ? 'approved' : 'rejected',
        moderatedAt: new Date().toISOString(),
      },
    });
  }),

  // Notifications endpoints
  http.get(`${baseURL}/notifications`, () => {
    return HttpResponse.json({
      success: true,
      notifications: [
        {
          id: 1,
          type: 'comment',
          message: 'New comment received',
          read: false,
          timestamp: new Date().toISOString(),
        },
        {
          id: 2,
          type: 'moderation',
          message: 'Comment flagged for review',
          read: false,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }),

  http.put(`${baseURL}/notifications/:id/read`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      notification: {
        id: parseInt(params.id),
        read: true,
      },
    });
  }),

  // Settings endpoints
  http.get(`${baseURL}/settings`, () => {
    return HttpResponse.json({
      success: true,
      settings: {
        theme: 'light',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          desktop: false,
        },
        moderation: {
          autoModeration: false,
          sensitivityLevel: 'medium',
          blockedWords: [],
        },
      },
    });
  }),

  http.put(`${baseURL}/settings`, async ({ request }) => {
    const body = await request.json();

    return HttpResponse.json({
      success: true,
      settings: body,
    });
  }),

  // Analytics endpoints
  http.get(`${baseURL}/analytics/summary`, () => {
    return HttpResponse.json({
      success: true,
      summary: {
        totalComments: 1250,
        approvedComments: 980,
        rejectedComments: 150,
        pendingComments: 120,
        platforms: {
          youtube: 750,
          twitch: 500,
        },
      },
    });
  }),

  // User management endpoints
  http.get(`${baseURL}/users`, () => {
    return HttpResponse.json({
      success: true,
      users: [
        {
          id: 1,
          username: 'testuser',
          displayName: 'Test User',
          role: 'user',
          status: 'active',
        },
        {
          id: 2,
          username: 'moderator',
          displayName: 'Moderator User',
          role: 'moderator',
          status: 'active',
        },
      ],
    });
  }),

  http.put(`${baseURL}/users/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json();

    return HttpResponse.json({
      success: true,
      user: {
        id: parseInt(id),
        ...body,
        updatedAt: new Date().toISOString(),
      },
    });
  }),

  // Health check
  http.get(`${baseURL}/health`, () => {
    return HttpResponse.json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }),
];
