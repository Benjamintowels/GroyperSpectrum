class Background {
  constructor() {
    this.bgX = 0;
    this.mgX = 0;
    this.fgX = 0;
  }

  update(speed) {
    this.bgX = (this.bgX - speed * 0.2) % 800;
    this.mgX = (this.mgX - speed * 0.55) % 800;
    this.fgX = (this.fgX - speed) % 800;
  }

  draw(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 310);
    sky.addColorStop(0, '#090912');
    sky.addColorStop(1, '#131325');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 800, 310);

    ctx.fillStyle = '#181830';
    for (let r = 0; r < 2; r++) this._city(ctx, this.bgX + r * 800);

    ctx.fillStyle = '#101020';
    for (let r = 0; r < 2; r++) this._mid(ctx, this.mgX + r * 800);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 310, 800, 90);

    ctx.fillStyle = '#3d3';
    ctx.fillRect(0, 310, 800, 2);

    ctx.fillStyle = '#222';
    for (let i = 0; i < 14; i++) {
      const sx = ((this.fgX * 1.3) + i * 62 + 800 * 2) % 800;
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