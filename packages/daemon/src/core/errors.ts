export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(400, message, 'BAD_REQUEST');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(409, message, code);
  }
}

export class VersionConflictError extends AppError {
  constructor(message = 'Version conflict') {
    super(409, message, 'VERSION_CONFLICT');
  }
}

export class ImmutableFileError extends AppError {
  constructor(message = 'Cannot modify immutable file') {
    super(400, message, 'IMMUTABLE_FILE');
  }
}

export class InvalidNameError extends AppError {
  constructor(message = 'Invalid name') {
    super(400, message, 'INVALID_NAME');
  }
}

export class AlreadyExistsError extends AppError {
  constructor(message = 'Already exists') {
    super(409, message, 'ALREADY_EXISTS');
  }
}
