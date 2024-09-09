type Primitive = string | number | boolean;
type Payload = { [key: string]: Payload | Primitive | Array<Primitive> | null };
type PayloadOrVoid = Payload | void;

export class MessageBroker {
  private status;
  private sendMessage;
  private callbacks: Map<string, Map<string, (payload?: Payload) => Promise<PayloadOrVoid> | PayloadOrVoid>> = new Map();

  constructor({ onMessage, sendMessage, status = true }: { onMessage: (callback: (data: Buffer) => void) => void; sendMessage: (data: Buffer) => void; status?: boolean }) {
    this.status = status;
    this.sendMessage = sendMessage;

    onMessage((data) => {
      if (!this.status) return;

      try {
        const unSerialize = JSON.parse(data.toString()) as { action?: string; payload?: Payload };
        if (!unSerialize.action) return;

        const isExist = this.callbacks.get(unSerialize.action);
        if (!isExist) return;

        isExist.forEach((callback) => callback(unSerialize.payload));
      } catch (err) {
        console.error(`[${Date.now()}] Error handling message:`, err, "Data:", data.toString());
      }
    });
  }

  on(action: string, callback: (payload?: Payload) => Promise<PayloadOrVoid> | PayloadOrVoid): string {
    const uuid = `${Date.now()}_${action}_${Math.random().toString(36).slice(2, 9)}`;
    const _callback = this.callbacks.get(action);

    const __callback = async (payload?: Payload) => {
      const value = await callback(payload);
      if (value) this.send(action, value);
    };

    if (_callback) {
      _callback.set(uuid, __callback);
    } else {
      const map = new Map();
      map.set(uuid, __callback);
      this.callbacks.set(action, map);
    }

    return uuid;
  }

  off(action: string, uuid: string) {
    const callback = this.callbacks.get(action);
    if (callback) callback.delete(uuid);
  }

  send(action: string, payload?: Payload) {
    if (!this.status) return;
    this.sendMessage(Buffer.from(JSON.stringify({ action, payload })));
  }

  async request(action: string, payload?: Payload) {
    return new Promise((resolve) => {
      const id = this.on(action, (data) => {
        this.off(action, id);
        resolve(data);
      });

      this.send(action, payload);
    });
  }
}
