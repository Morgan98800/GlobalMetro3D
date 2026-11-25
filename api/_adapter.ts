export interface NetlifyEventLike {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string>;
}

export interface NetlifyResponseLike {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
}

export type NetlifyHandlerLike = (
  event: NetlifyEventLike,
  context?: Record<string, unknown>
) => Promise<NetlifyResponseLike>;

/**
 * Adapts an existing Netlify Function handler to a Vercel Web-standard Function.
 */
export function createVercelHandler(netlifyHandler: NetlifyHandlerLike) {
  return async function handle(request: Request): Promise<Response> {
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    if (!headers['x-forwarded-for'] && headers['x-real-ip']) {
      headers['x-forwarded-for'] = headers['x-real-ip'];
    }

    const url = new URL(request.url);
    const queryStringParameters = Object.fromEntries(url.searchParams.entries());

    const result = await netlifyHandler(
      {
        httpMethod: request.method,
        headers,
        queryStringParameters,
      },
      {}
    );

    return new Response(result.body ?? '', {
      status: result.statusCode ?? 200,
      headers: result.headers,
    });
  };
}
