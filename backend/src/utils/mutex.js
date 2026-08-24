class Mutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }

  acquire() {
    return new Promise((resolve) => {
      if (!this._locked) {
        this._locked = true;
        resolve(this._release.bind(this));
      } else {
        this._queue.push(resolve);
      }
    });
  }

  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next(this._release.bind(this));
    } else {
      this._locked = false;
    }
  }
}

module.exports = { Mutex };