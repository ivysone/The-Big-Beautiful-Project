import { Start } from './scenes/Start.js';
import { LevelOne } from './scenes/LevelOne.js';

const config = {
    type: Phaser.AUTO,
    title: 'Overlord Rising',
    description: '',
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    pixelArt: true,
    scene: [
        LevelOne,
        Start
    ],
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 },
      debug: false
        }
    }
}

new Phaser.Game(config);
            