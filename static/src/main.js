import { LevelOne } from './scenes/Level1/LevelOne.js';
import { LevelTwo } from './scenes/Level2/LevelTwo.js';
import { LevelThree } from './scenes/LevelThree.js';
import { LevelFour } from './scenes/LevelFour.js';
import { LevelTen } from './scenes/Level10/LevelTen.js';
import { LevelSix } from './scenes/Level6/LevelSix.js';
import { LevelSeven } from './scenes/Level7/levelSeven.js';

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
        LevelTwo,
        LevelThree,
        LevelFour,
        LevelSix,
        LevelSeven,
        LevelTen
    ],
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
    default: 'matter',
    matter: {
        gravity: {y: 1},
        debug: false
        }
    }
}

new Phaser.Game(config);
            