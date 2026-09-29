/** 统一的 HTTP 业务异常 */
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export const badRequest = (msg = '请求参数有误') => new HttpError(400, msg);
export const unauthorized = (msg = '未登录或登录已过期') => new HttpError(401, msg);
export const notFound = (msg = '资源不存在') => new HttpError(404, msg);
export const conflict = (msg = '资源已存在') => new HttpError(409, msg);
