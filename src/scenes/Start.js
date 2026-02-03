
const AssetKeys = {
    BACKGROUND: 'background',
    MOUNTAIN: 'mountain',
    TREE_1: 'tree_1',
    TREE_2: 'tree_2',
    TREE_3: 'tree_3',
    LOGO: 'logo',
    PLAY_BUTTON: 'play_button'
}

export class Start extends Phaser.Scene {

    constructor() {
        super('Start');
    }

    preload() {
        this.load.image(AssetKeys.BACKGROUND, 'assets/platforms/background/normal/skybox.png');
        this.load.image(AssetKeys.MOUNTAIN, 'assets/platforms/background/normal/mountain.png');
        this.load.image(AssetKeys.TREE_1, 'assets/platforms/background/normal/tree1.png');
        this.load.image(AssetKeys.TREE_2, 'assets/platforms/background/normal/tree2.png');
        this.load.image(AssetKeys.TREE_3, 'assets/platforms/background/normal/tree3.png');
        this.load.image(AssetKeys.LOGO, 'assets/logo.png');
        this.load.image(AssetKeys.PLAY_BUTTON, 'assets/play_button.png');

    }

    create() {
        const {width, height} = this.scale;
        this.background = this.add.tileSprite(0, 0, width, height, AssetKeys.BACKGROUND).setScale(2);
        this.mountain = this.add.tileSprite(0, -50, width, height, AssetKeys.MOUNTAIN).setScale(2);
        this.tree1 = this.add.tileSprite(0, 0, width, height, AssetKeys.TREE_1).setScale(2);
        this.tree2 = this.add.tileSprite(0, 0, width, height, AssetKeys.TREE_2).setScale(2);
        this.tree3 = this.add.tileSprite(0, 0, width, height, AssetKeys.TREE_3).setScale(2);
        this.fadeRect = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000)
        .setOrigin(0)
        .setAlpha(0);

        const cam = this.cameras.main;
        cam.setZoom(1.3);
        cam.centerOn(640, 280);

        this.logo = this.add.image(640, -200, AssetKeys.LOGO).setScale(0.7);

        this.playButton = this.add.image(-540, 380, AssetKeys.PLAY_BUTTON).setScale(3).setInteractive({ useHandCursor: true});

        this.playButton.on('pointerover', () => {
            playButton.setScale(3.05);
        });

        this.playButton.on('pointerout', () => {
            playButton.setScale(3);
        });

        this.playButton.on('pointerup', () => {
            this.fadeOutAndStart();
        });

        this.tweens.add({
            targets: this.logo,
            y: 200,
            duration: 4000,
            ease: 'Sine.easeOut'
        });

        this.tweens.add({
            targets: this.playButton,
            x: 640,
            duration: 4000,
            ease: 'Sine.easeOut'
        });
    }

    fadeOutAndStart() {

        this.playButton.disableInteractive();

        this.tweens.add({
            targets: this.playButton,
            x: -640,
            duration: 2000,
            ease: 'Sine.easeIn'
        });

        this.tweens.add ({
            targets: this.logo,
            y: -200,
            duration: 2000,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this.tweens.add({
                    targets: this.fadeRect,
                    alpha: 1,
                    duration: 2000,
                    ease: 'Quad.easeInOut',
                    onComplete: () => {
                        this.scene.start('LevelOne');
                    }
                });
            }
        })
    }

    update() {
        this.background.tilePositionX += 0.1;
        this.mountain.tilePositionX += 0.14;
        this.tree1.tilePositionX += 0.2;
        this.tree2.tilePositionX += 0.27;
        this.tree3.tilePositionX += 0.3;

    }
    
}
