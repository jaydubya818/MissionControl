import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
test('all public Convex builders use the canonical Mission boundary', async () => {
  async function walk(dir) {
    const result=[];
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      if(['_generated','__tests__'].includes(entry.name)) continue;
      const path=dir+'/'+entry.name;
      if(entry.isDirectory()) result.push(...await walk(path));
      else if(path.endsWith('.ts')) result.push(path);
    }
    return result;
  }
  let covered=0;
  for(const path of await walk('convex')) {
    if(path==='convex/lib/missionScopedFunctions.ts') continue;
    const tree=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true);
    for(const node of tree.statements) {
      if(!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly) continue;
      const source=node.moduleSpecifier.text;
      if(!source.endsWith('_generated/server') && source!=='convex/server') continue;
      const bindings=node.importClause?.namedBindings;
      assert.ok(!bindings || ts.isNamedImports(bindings),`Namespace builder import: ${path}`);
      for(const entry of bindings?.elements??[]) {
        if(entry.isTypeOnly) continue;
        const name=(entry.propertyName??entry.name).text;
        assert.ok(!['query','mutation','action','queryGeneric','mutationGeneric','actionGeneric'].includes(name),`Raw public builder ${path}:${name}`);
      }
    }
    if((await readFile(path,'utf8')).includes('missionScopedFunctions')) covered++;
  }
  assert.ok(covered>150,'The shared boundary must cover the whole backend');
});
