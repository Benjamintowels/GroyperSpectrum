class Background {
  constructor() {
    this.bgX = 0;
    this.mgX = 0;
    this.fgX = 0;
  }

  update(speed) {
    const tileW = 800; // width of one background tile
    this.bgX = (this.bgX - speed * 0.2) % tileW;
    this.mgX = (this.mgX - speed * 0.55) % tileW;
    this.fgX = (this.fgX - speed) % tileW;
  }

  draw(ctx) {
    const w = ctx.canvas ? ctx.canvas.width : 800;
    const sky = ctx.createLinearGradient(0, 0, 0, 310);
    sky.addColorStop(0, '#090912');
    sky.addColorStop(1, '#131325');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, 310);

    const tileW = 800;

    ctx.fillStyle = '#181830';
    for (let r = 0; r < Math.ceil(w / tileW) + 1; r++) {
      this._city(ctx, this.bgX + r * tileW);
    }

    ctx.fillStyle = '#101020';
    for (let r = 0; r < Math.ceil(w / tileW) + 1; r++) {
      this._mid(ctx, this.mgX + r * tileW);
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 310, w, 90);

    ctx.fillStyle = '#3d3';
    ctx.fillRect(0, 310, w, 2);

    ctx.fillStyle = '#222';
    const stripeCount = Math.ceil(w / 62) + 2;
    for (let i = 0; i < stripeCount; i++) {
      const sx = ((this.fgX * 1.3) + i * 62 + w * 2) % w;
      ctx.fillRect(sx, 316, 32, 3);
    }
  }

  _city(ctx, ox) {
    const b = [
      [0,90,55],[65,55,48],[120,100,65],[195,65,42],
      [245,105,72],[325,48,52],[385,80,60],[450,60,48],
      [508,88,70],[588,50,55],[645,75,52],[705,95,75]
    ];
    for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
  }

  _mid(ctx, ox) {
    const b = [
      [10,42,28],[75,56,24],[145,38,36],[215,50,26],
      [290,44,32],[365,40,28],[430,52,24],[500,46,36],
      [575,38,30],[640,54,26],[710,42,33],[775,48,28]
    ];
    for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
  }
}