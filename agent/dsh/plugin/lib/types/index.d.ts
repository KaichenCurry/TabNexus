import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
export declare const name = "tabnexus";
export declare const inject: string[];
export interface Config {
    /** TabNexus MCP bridge 端口（Chrome 扩展同端口），默认 43119 */
    bridgePort?: number;
    /** 启动 tabnexus-mcp 的命令，默认 node */
    mcpCommand?: string;
    /** tabnexus-mcp 启动参数，默认指向仓库桥接脚本 */
    mcpArgs?: string[];
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
