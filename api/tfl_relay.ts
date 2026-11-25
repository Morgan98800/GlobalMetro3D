import { handler } from '../netlify/functions/tfl_relay';
import { createVercelHandler } from './_adapter';

const handle = createVercelHandler(handler);
export { handle as GET, handle as OPTIONS };
