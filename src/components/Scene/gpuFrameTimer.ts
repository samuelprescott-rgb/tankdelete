interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** Optional asynchronous timer. No waits, gl.finish, or unavailable-result reads. */
export function createGpuFrameTimer(context: WebGL2RenderingContext) {
  const extension = context.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;
  let disposed = false;
  return {
    supported: !!extension,
    begin() {
      if (disposed || !extension || active || pending.length >= 4 || context.isContextLost()) return;
      active = context.createQuery();
      if (active) context.beginQuery(extension.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (!extension || !active) return;
      if (context.isContextLost()) {
        context.deleteQuery(active); active = null;
        return;
      }
      context.endQuery(extension.TIME_ELAPSED_EXT);
      pending.push(active); active = null;
    },
    poll(): number | null {
      if (disposed || !extension || !pending.length) return null;
      if (context.isContextLost() || context.getParameter(extension.GPU_DISJOINT_EXT)) {
        pending.splice(0).forEach(query => context.deleteQuery(query));
        return null;
      }
      const query = pending[0];
      if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) return null;
      const nanoseconds = context.getQueryParameter(query, context.QUERY_RESULT) as number;
      pending.shift(); context.deleteQuery(query);
      return Number.isFinite(nanoseconds) && nanoseconds >= 0 ? nanoseconds / 1_000_000 : null;
    },
    dispose() {
      if (disposed) return;
      if (active && extension) {
        if (!context.isContextLost()) context.endQuery(extension.TIME_ELAPSED_EXT);
        context.deleteQuery(active); active = null;
      }
      pending.splice(0).forEach(query => context.deleteQuery(query));
      disposed = true;
    },
  };
}
