import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';

export default function handler(req: IncomingMessage, res: ServerResponse): void;
export const app: Express;
