// Membres de démonstration pour l'artefact (mot de passe : zovy2026)
import { writeFileSync } from 'node:fs';
import { makeMember } from '../src/model/members';
const out = process.argv[2];
const list = [await makeMember('hasina', 'zovy2026', true), await makeMember('misa', 'zovy2026'), await makeMember('toky', 'zovy2026')];
writeFileSync(out, JSON.stringify(list));
console.log(`→ ${out}`);
