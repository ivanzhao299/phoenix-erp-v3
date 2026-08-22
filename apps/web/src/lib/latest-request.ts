export class LatestRequestRunner<T> {
  private generation = 0;
  private controller: AbortController | null = null;
  private latest: Promise<T> | null = null;

  run(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const request: Promise<T> = task(controller.signal).then(async (result): Promise<T> => {
      if (generation !== this.generation && this.latest) {
        return this.latest;
      }
      return result;
    });
    this.latest = request;
    return request;
  }

  abort(): void {
    this.controller?.abort();
  }
}
