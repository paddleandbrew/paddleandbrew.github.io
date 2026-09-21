/* tslint:disable */
/* eslint-disable */

export function brewer_preset(kind: any): any;

export function builtin_configs(): any;

export function catalogue(): any;

export function check_numbers(text: string, facts: any): any;

export function compare_configs(config_a: any, config_b: any, logs: any, params: any, opts: any): any;

export function config_hash(config: any): string;

export function default_params(config: any): any;

export function explain_calibration(fit_result: any): any;

export function explain_pair(a_label: string, a: any, b_label: string, b: any): any;

export function falsification_specs(): any;

export function fit_setup(config: any, logs: any, params: any, opts: any): any;

export function flavour_dataset(config: any, params: any, logs: any): any;

export function flavour_descriptors(): any;

export function prediction_bands(config: any, inputs: any, params: any, opts: any): any;

export function quick_to_inputs(quick: any): any;

export function registry(): any;

export function replay_log(config: any, params: any, log: any): any;

export function run_falsification(logs: any, params: any, opts: any): any;

export function sample_inputs(): any;

export function search_recipes(config: any, inputs: any, params: any, target: any, levers: any, opts: any): any;

/**
 * Simulate. Returns `{ result, t, data, stride }` where `data` is a Float64Array of snapshots.
 */
export function simulate(config: any, inputs: any, params: any, store_series: boolean): any;

export function solver_version(): string;

export function start(): void;

export function synthetic_logs(config: any, params: any, seed: number, n_per_setup: number, setups: any): any;

export function validate_inputs(inputs: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly brewer_preset: (a: any) => [number, number, number];
    readonly builtin_configs: () => [number, number, number];
    readonly catalogue: () => [number, number, number];
    readonly check_numbers: (a: number, b: number, c: any) => [number, number, number];
    readonly compare_configs: (a: any, b: any, c: any, d: any, e: any) => [number, number, number];
    readonly config_hash: (a: any) => [number, number, number, number];
    readonly default_params: (a: any) => [number, number, number];
    readonly explain_calibration: (a: any) => [number, number, number];
    readonly explain_pair: (a: number, b: number, c: any, d: number, e: number, f: any) => [number, number, number];
    readonly falsification_specs: () => [number, number, number];
    readonly fit_setup: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly flavour_dataset: (a: any, b: any, c: any) => [number, number, number];
    readonly flavour_descriptors: () => [number, number, number];
    readonly prediction_bands: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly quick_to_inputs: (a: any) => [number, number, number];
    readonly registry: () => [number, number, number];
    readonly replay_log: (a: any, b: any, c: any) => [number, number, number];
    readonly run_falsification: (a: any, b: any, c: any) => [number, number, number];
    readonly sample_inputs: () => [number, number, number];
    readonly search_recipes: (a: any, b: any, c: any, d: any, e: any, f: any) => [number, number, number];
    readonly simulate: (a: any, b: any, c: any, d: number) => [number, number, number];
    readonly solver_version: () => [number, number];
    readonly start: () => void;
    readonly synthetic_logs: (a: any, b: any, c: number, d: number, e: any) => [number, number, number];
    readonly validate_inputs: (a: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
