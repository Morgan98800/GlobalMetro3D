import { handler } from '../netlify/functions/lille_relay';
import { createVercelHandler } from './_adapter';

const handle = createVercelHandler(handler);
export { handle as GET, handle as OPTIONS };
