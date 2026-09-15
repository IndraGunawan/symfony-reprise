import type { RsbuildPlugin } from '@rsbuild/core';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import { build, createServer as createViteServer } from 'vite';
import { describe, expect, it } from 'vitest';
import SymfonyRsbuild from '../../src/rsbuild';
import SymfonyVite from '../../src/vite';

const fixture = join(import.meta.dirname, '../fixtures/basic');

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, () => {
            const addr = srv.address();
            if (addr && typeof addr === 'object') {
                const { port } = addr;
                srv.close(() => resolve(port));
            } else {
                srv.close(() => reject(new Error('no port')));
            }
        });
    });
}

describe('metadataPath separate from outputPath (cross-bundler parity)', () => {
    describe('build mode', () => {
        it('vite build writes entrypoints.json and manifest.json to metadataPath only', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-vite-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-vite-meta-'));

            await build({
                root: fixture,
                logLevel: 'silent',
                build: {
                    emptyOutDir: true,
                    rollupOptions: {
                        input: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') },
                    },
                },
                plugins: [SymfonyVite({ outputPath: out, metadataPath: meta, publicPath: '/build/' })],
            });

            // Metadata files exist in metadataPath
            expect(existsSync(join(meta, 'entrypoints.json'))).toBe(true);
            expect(existsSync(join(meta, 'manifest.json'))).toBe(true);

            // Metadata files do NOT exist in outputPath
            expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
            expect(existsSync(join(out, 'manifest.json'))).toBe(false);

            // Compiled assets still exist in outputPath
            const files = readdirSync(out);
            expect(files.some((f) => /^app-.*\.js$/.test(f))).toBe(true);

            const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
            expect(entry.isProd).toBe(true);
            expect(Object.keys(entry.entryPoints).sort()).toEqual(['admin', 'app']);

            const manifest = JSON.parse(readFileSync(join(meta, 'manifest.json'), 'utf8'));
            expect(manifest['build/app.js']).toMatch(/^\/build\/app-.*\.js$/);
        }, 30_000);

        it('rsbuild build writes entrypoints.json and manifest.json to metadataPath only', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-rsbuild-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-rsbuild-meta-'));

            const rsbuild = await createRsbuild({
                cwd: fixture,
                rsbuildConfig: {
                    mode: 'production',
                    source: { entry: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') } },
                    plugins: [SymfonyRsbuild({ outputPath: out, metadataPath: meta, publicPath: '/build/' })],
                },
            });
            await rsbuild.build();

            // Metadata files exist in metadataPath
            expect(existsSync(join(meta, 'entrypoints.json'))).toBe(true);
            expect(existsSync(join(meta, 'manifest.json'))).toBe(true);

            // Metadata files do NOT exist in outputPath
            expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
            expect(existsSync(join(out, 'manifest.json'))).toBe(false);

            // Compiled assets still exist in outputPath
            const files = readdirSync(out, { recursive: true }).map((f) => String(f).replace(/\\/g, '/'));
            expect(files.some((f) => /^static\/js\/app\..*\.js$/.test(f))).toBe(true);

            const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
            expect(entry.isProd).toBe(true);
            expect(Object.keys(entry.entryPoints).sort()).toEqual(['admin', 'app']);

            const manifest = JSON.parse(readFileSync(join(meta, 'manifest.json'), 'utf8'));
            expect(Object.keys(manifest).length).toBeGreaterThan(0);
        }, 60_000);

        it('vite build with SRI computes hashes for assets in outputPath and writes to metadataPath', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-sri-vite-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-sri-vite-meta-'));

            await build({
                root: fixture,
                logLevel: 'silent',
                build: {
                    emptyOutDir: true,
                    rollupOptions: {
                        input: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') },
                    },
                },
                plugins: [
                    SymfonyVite({
                        outputPath: out,
                        metadataPath: meta,
                        publicPath: '/build/',
                        integrity: { enabled: true },
                    }),
                ],
            });

            expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
            expect(existsSync(join(out, 'manifest.json'))).toBe(false);

            const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
            expect(entry.integrity).toBeDefined();
            expect(Object.keys(entry.integrity).length).toBeGreaterThan(0);
            for (const hash of Object.values(entry.integrity) as string[]) {
                expect(hash).toMatch(/^sha384-/);
            }
        }, 30_000);

        it('rsbuild build with SRI computes hashes for assets in outputPath and writes to metadataPath', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-sri-rsbuild-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-sri-rsbuild-meta-'));

            const rsbuild = await createRsbuild({
                cwd: fixture,
                rsbuildConfig: {
                    mode: 'production',
                    source: { entry: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') } },
                    plugins: [
                        SymfonyRsbuild({
                            outputPath: out,
                            metadataPath: meta,
                            publicPath: '/build/',
                            integrity: { enabled: true },
                        }),
                    ],
                },
            });
            await rsbuild.build();

            expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
            expect(existsSync(join(out, 'manifest.json'))).toBe(false);

            const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
            expect(entry.integrity).toBeDefined();
            expect(Object.keys(entry.integrity).length).toBeGreaterThan(0);
            for (const hash of Object.values(entry.integrity) as string[]) {
                expect(hash).toMatch(/^sha384-/);
            }
        }, 60_000);
    });

    describe('dev mode', () => {
        it('vite dev writes entrypoints.json and manifest.json to metadataPath only', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-dev-vite-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-dev-vite-meta-'));

            const server = await createViteServer({
                root: fixture,
                logLevel: 'silent',
                server: { port: 0, host: '127.0.0.1' },
                build: {
                    rollupOptions: {
                        input: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') },
                    },
                },
                plugins: [SymfonyVite({ outputPath: out, metadataPath: meta, publicPath: '/build/' })],
            });
            await server.listen();

            try {
                expect(existsSync(join(meta, 'entrypoints.json'))).toBe(true);
                expect(existsSync(join(meta, 'manifest.json'))).toBe(true);
                expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
                expect(existsSync(join(out, 'manifest.json'))).toBe(false);

                const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
                expect(entry.isProd).toBe(false);
                expect(entry.devServer).not.toBeNull();
            } finally {
                await server.close();
            }
        }, 30_000);

        it('rsbuild dev writes entrypoints.json and manifest.json to metadataPath only', async () => {
            const out = mkdtempSync(join(tmpdir(), 'ups-meta-dev-rsbuild-out-'));
            const meta = mkdtempSync(join(tmpdir(), 'ups-meta-dev-rsbuild-meta-'));
            const port = await getFreePort();

            let resolveWritten: () => void;
            const symfonyWritten = new Promise<void>((resolve) => {
                resolveWritten = resolve;
            });
            const waitForSymfonyWrite: RsbuildPlugin = {
                name: 'test-wait-for-symfony-write',
                setup(api) {
                    api.onAfterCreateCompiler(({ compiler }) => {
                        const compilers = 'compilers' in compiler ? compiler.compilers : [compiler];
                        for (const c of compilers) {
                            c.hooks.done.tap('test-wait-for-symfony-write', () => resolveWritten());
                        }
                    });
                },
            };

            const rsbuild = await createRsbuild({
                cwd: fixture,
                rsbuildConfig: {
                    mode: 'development',
                    source: { entry: { app: join(fixture, 'app.js'), admin: join(fixture, 'admin.js') } },
                    server: { port },
                    plugins: [
                        SymfonyRsbuild({ outputPath: out, metadataPath: meta, publicPath: '/build/' }),
                        waitForSymfonyWrite,
                    ],
                },
            });
            const server = await rsbuild.startDevServer();
            await symfonyWritten;

            try {
                expect(existsSync(join(meta, 'entrypoints.json'))).toBe(true);
                expect(existsSync(join(meta, 'manifest.json'))).toBe(true);
                expect(existsSync(join(out, 'entrypoints.json'))).toBe(false);
                expect(existsSync(join(out, 'manifest.json'))).toBe(false);

                const entry = JSON.parse(readFileSync(join(meta, 'entrypoints.json'), 'utf8'));
                expect(entry.isProd).toBe(false);
                expect(entry.devServer).not.toBeNull();
            } finally {
                await server.server.close();
            }
        }, 60_000);
    });
});
