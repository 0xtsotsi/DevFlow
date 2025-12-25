/**
 * Validation middleware for Express routes
 *
 * Provides Zod-based validation for request bodies, query parameters, and route parameters.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { z } from 'zod';

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Format Zod validation errors into a user-friendly response
 */
function formatValidationError(error: ZodError): {
  success: false;
  error: string;
  details: Array<{ path: string; message: string; code: string }>;
} {
  return {
    success: false,
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

// ============================================================================
// Body Validation Middleware
// ============================================================================

/**
 * Create middleware to validate request body against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.post('/create', validateBody(createBeadsIssueSchema), handler);
 * ```
 */
export function validateBody<T extends z.ZodType>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Parse and validate the request body
      const validatedData = schema.parse(req.body) as z.infer<T>;
      // Replace req.body with validated data
      (req.body as z.infer<T>) = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatValidationError(error));
        return;
      }
      next(error);
    }
  };
}

// ============================================================================
// Query Validation Middleware
// ============================================================================

/**
 * Create middleware to validate request query against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.get('/list', validateQuery(listBeadsIssuesFiltersSchema), handler);
 * ```
 */
export function validateQuery<T extends z.ZodType>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validatedData = schema.parse(req.query) as z.infer<T>;
      (req.query as z.infer<T>) = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatValidationError(error));
        return;
      }
      next(error);
    }
  };
}

// ============================================================================
// Parameter Validation Middleware
// ============================================================================

/**
 * Create middleware to validate request parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.get('/issues/:issueId', validateParams(beadsIssueRouteParamsSchema), handler);
 * ```
 */
export function validateParams<T extends z.ZodType>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validatedData = schema.parse(req.params) as z.infer<T>;
      (req.params as z.infer<T>) = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatValidationError(error));
        return;
      }
      next(error);
    }
  };
}

// ============================================================================
// Combined Validation Middleware
// ============================================================================

/**
 * Create middleware to validate body, query, and/or params against Zod schemas
 *
 * @param options - Object with optional schemas for body, query, and/or params
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.post('/issues/:issueId',
 *   validate({ body: updateBeadsIssueSchema, params: beadsIssueRouteParamsSchema }),
 *   handler
 * );
 * ```
 */
export function validate<
  TBody extends z.ZodType | undefined = undefined,
  TQuery extends z.ZodType | undefined = undefined,
  TParams extends z.ZodType | undefined = undefined,
>(options: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (options.body) {
        const validatedData = options.body.parse(req.body) as z.infer<TBody>;
        (req.body as z.infer<TBody>) = validatedData;
      }
      if (options.query) {
        const validatedData = options.query.parse(req.query) as z.infer<TQuery>;
        (req.query as z.infer<TQuery>) = validatedData;
      }
      if (options.params) {
        const validatedData = options.params.parse(req.params) as z.infer<TParams>;
        (req.params as z.infer<TParams>) = validatedData;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatValidationError(error));
        return;
      }
      next(error);
    }
  };
}
