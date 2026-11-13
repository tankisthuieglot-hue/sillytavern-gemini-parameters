import { fileURLToPath } from 'node:url';
import { init as initPlugin } from './plugins/gemini-additional-parameters/index.mjs';

export { info } from './plugins/gemini-additional-parameters/index.mjs';

export function init(router) {
    return initPlugin(router, { sillyTavernRoot: fileURLToPath(new URL('../../', import.meta.url)) });
}
