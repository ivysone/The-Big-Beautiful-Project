export class HUD {
    constructor(scene) {
        this.scene = scene;
        this.container = scene.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(10000);

        this.create();
        this.layout(scene.scale.width, scene.scale.height);

        scene.scale.on('resize', size => {
        this.layout(size.width, size.height);
        });
    }

    create() {
        this.hpFill = this.scene.add.image(2, 3, 'hpFill').setOrigin(0, 0).setScale(1.06);
        this.stFill = this.scene.add.image(63, 54, 'stFill').setOrigin(0, 0).setTint(0x00ff00);
        this.frame = this.scene.add.image(0, 0, 'hudFrame').setOrigin(0, 0);

        this.container.add([this.hpFill, this.stFill, this.frame]);

        this.hpW = this.hpFill.texture.getSourceImage().width;
        this.hpH = this.hpFill.texture.getSourceImage().height;
        this.stW = this.stFill.texture.getSourceImage().width;
        this.stH = this.stFill.texture.getSourceImage().height;
    }

    setHP(r) {
        const rClamped = Phaser.Math.Clamp(r, 0, 1);

        const cropH = Math.floor(this.hpH * rClamped);
        const y = this.hpH - cropH;           

        this.hpFill.setCrop(0, y, this.hpW, cropH);
    }

    setStamina(r) {
        const rClamped = Phaser.Math.Clamp(r, 0, 1);

        const cropW = Math.floor(this.stW * rClamped);
        this.stFill.setCrop(0, 0, cropW, this.stH);
    }



    layout(w, h) {
        const margin = 10;

        const BASE_UI_SCALE = 2.5;   

        const baseWidth = 1280;
        const responsive = Phaser.Math.Clamp(w / baseWidth, 0.9, 1.4);

        const scale = BASE_UI_SCALE * responsive;
        this.container.setScale(scale);

        const hudHeight = this.frame.displayHeight * scale;

        this.container.setPosition(
        margin,
        h - hudHeight - margin
        );
    }
}
