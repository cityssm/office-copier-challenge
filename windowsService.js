import path from 'node:path';
const _dirname = '.';
export const serviceConfig = {
    name: 'Office Copier Challenge',
    description: 'An initiative to help reduce paper usages by tracking how much we print.',
    script: path.join(_dirname, 'index.js')
};
