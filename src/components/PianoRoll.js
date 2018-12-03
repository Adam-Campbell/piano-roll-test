import React, { Component } from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { connect } from 'react-redux';
import * as ActionCreators from '../actions';
import { generateId } from '../helpers';
import Tone from 'tone';
import QuantizeSelect from './QuantizeSelect';
import CursorSelect from './CursorSelect';
import DurationSelect from './DurationSelect';
import { Rnd } from 'react-rnd';
import { debounce, throttle } from 'lodash';

class PianoRoll extends Component {
    constructor(props) {
        super(props);
        //this.section = this.props.sections[this.props.id];
        this.padding = 10;
        this.stageRef = React.createRef();
        //window.stageRef = this.stageRef;
        this.gridLayerRef = React.createRef();
        this.noteLayerRef = React.createRef();
        //this.horizontalDragMove = this._horizontalDragMove.bind(this);
        this.horizontalDragMove = throttle(this._horizontalDragMove, 16).bind(this);
        //this.verticalDragMove = this._verticalDragMove.bind(this);
        this.verticalDragMove = throttle(this._verticalDragMove, 16).bind(this);
        this.throttledResizeCanvas = throttle(this._resizeCanvas, 16).bind(this);
        this.canvasWidth = this.section.numberOfBars * 384;
        this._notesArray = this._createNotesArray();
        // this._timeArray = [
        //     '0:0:0', '0:0:1', '0:0:2', '0:0:3', '0:1:0', '0:1:1', '0:1:2', '0:1:3',
        //     '0:2:0', '0:2:1', '0:2:2', '0:2:3', '0:3:0', '0:3:1', '0:3:2', '0:3:3',
        //     '1:0:0', '1:0:1', '1:0:2', '1:0:3', '1:1:0', '1:1:1', '1:1:2', '1:1:3',
        //     '1:2:0', '1:2:1', '1:2:2', '1:2:3', '1:3:0', '1:3:1', '1:3:2', '1:3:3',
        //     '2:0:0', '2:0:1', '2:0:2', '2:0:3', '2:1:0', '2:1:1', '2:1:2', '2:1:3',
        //     '2:2:0', '2:2:1', '2:2:2', '2:2:3', '2:3:0', '2:3:1', '2:3:2', '2:3:3',
        //     '3:0:0', '3:0:1', '3:0:2', '3:0:3', '3:1:0', '3:1:1', '3:1:2', '3:1:3',
        //     '3:2:0', '3:2:1', '3:2:2', '3:2:3', '3:3:0', '3:3:1', '3:3:2', '3:3:3',
        // ];
        // this._cellsArray = this._createCellsArray();
        // this._linesArray = this._createLinesArray();
        this.handleStageClick = this._handleStageClick.bind(this);
        this.handleMouseDown = this._handleMouseDown.bind(this);
        this.handleMouseUp = this._handleMouseUp.bind(this);
        this.updateLayerPos = this._updateLayerPos.bind(this);
        this.state = {
            quantize: '16n',
            duration: '16n',
            mouseDownPosX: 0,
            mouseDownPosY: 0,
            pencilActive: false,
            isDraggable: false,
            layerPosX: 0,
            layerPosY: 0,
            stageWidth: 800,
            stageHeight: 600,
            showStage: true
        };
        // old color scheme
        // background: #e0f7fa
        // gridlines: #80deea
        // notes fill: #0097a7
        // notes stroke: #006064 
    }

    componentDidMount() {
        //window.addEventListener('resize', this.throttledResizeCanvas);
    }

    componentWillUnmount() {
        /*why does this fix the error previously being caused by destroy method on stage being 
        called at unmount? Destroy method for reference:

        destroy: function destroy() {
            var content = this.content;
            Konva.Container.prototype.destroy.call(this);

            if (content && Konva.Util._isInDocument(content)) {
                this.getContainer().removeChild(content);
            }

            var index = Konva.stages.indexOf(this);

            if (index > -1) {
                Konva.stages.splice(index, 1);
            }

            return this;
        }
        */
        this.stageRef.current.content = null;
    }

    _resizeCanvas(e) {
        //console.log(this.stageRef);
        const windowWidth = window.document.documentElement.clientWidth;
        //this.stageRef.current.width(windowWidth - 80);
        this.setState({
            stageWidth: windowWidth - 80
        });
    }

    get section() {
        return this.props.sections[this.props.id];
    }

    _createNotesArray() {
        const onlyNotes = ['B', 'A#', 'A','G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
        const onlyOctaves = ['8', '7', '6', '5', '4', '3', '2', '1', '0'];
        let notesArray = [];
        for (let octave of onlyOctaves) {
            for (let note of onlyNotes) {
                notesArray.push(note + octave);
            }
        }
        return notesArray;
    }

    ___createCellsArray() {
        // need to end up with an array of objects, and each object has the pitch, time, and i and j
        // positions for that cell. 
        let notesArray = this._notesArray;
        let timeArray = this._timeArray;
        let cellsArray = [];
        for (let i = 0; i < timeArray.length; i++) {
            for (let j = 0; j < notesArray.length; j++) {
                cellsArray.push({
                    pitch: notesArray[j],
                    time: timeArray[i],
                    x: 48 * i,
                    y: 16 * j
                });
            }
        }
        return cellsArray;
    }

    _createGridLinesArray() {
        let linesArray = [];
        let strokeWidth = 2;
        let escapeHatch = 0;
        let currPos = 0;
        let quantizeInterval = Tone.Time(this.state.quantize).toTicks() / 2;

        while(currPos <= this.canvasWidth && escapeHatch < 1000) {
            if (currPos % 384 === 0) {
                strokeWidth = 2;
            } else if (currPos % 96 === 0) {
                strokeWidth = 1;
            } else {
                strokeWidth = 0.5;
            }
            linesArray.push({
                points: [currPos, 0, currPos, 1728],
                strokeWidth: strokeWidth
            });
            currPos += quantizeInterval;
            escapeHatch++;
        }

        // create horizontal lines
        for (let j = 0; j <= 108; j++) {
            linesArray.push({
                points: [0, j*16, this.canvasWidth, j*16],
                strokeWidth: 1
            });
        }

        return linesArray;
    }

    ___createLinesArray() {
        let linesArray = [];
        // create vertical lines
        for (let i = 0; i <= 64; i++) {
            linesArray.push({
                points: [i*24, 0, i*24, 1750],
                strokeWidth: i % 4 ? 0.5 : 1
            });
        }

        // create horizontal lines
        for (let j = 0; j <= 108; j++) {
            linesArray.push({
                points: [0, j*16, 1550, j*16],
                strokeWidth: 1
            });
        }

        return linesArray;
    }

    _calculateNoteInfo(x, y) {
        let currQuantizeAsTicks = Tone.Time(this.state.quantize).toTicks();
        let rowClicked = Math.floor(y / 16);
        let adjustedX = x - (x%(currQuantizeAsTicks/2));
        let adjustedY = y - (y % 16);
        let xPosAsTicks = Tone.Ticks(x*2-(x*2%currQuantizeAsTicks)).toBarsBeatsSixteenths();
        const duration = this.state.duration;
        const noteInfo = {
            pitch: this._notesArray[rowClicked],
            time: xPosAsTicks,
            duration: duration,
            _id: generateId(),
            x: adjustedX,
            y: adjustedY,
            width: Tone.Time(duration).toTicks() / 2
        };
        return noteInfo;
    }

    _handleStageClick(e) {
        console.log(e);
        let t = e.target;
        if (t.attrs.type && t.attrs.type === 'noteRect') {
            const { pitch, time } = t.attrs;
            this.props.removeNote(this.section.id, pitch, time);
        } else {
            if (!this.state.pencilActive) {
                let x = e.evt.layerX;
                let scrolledX = this.gridLayerRef.current.attrs.x || 0;
                let xWithScroll = x - scrolledX;
                let y = e.evt.layerY;
                let scrolledY = this.gridLayerRef.current.attrs.y || 0;
                let yWithScroll = y - scrolledY;
                let noteObject = this._calculateNoteInfo(xWithScroll, yWithScroll);
                if (this._isValidNote(noteObject)) {
                    this.props.addNote(this.section.id, noteObject);
                }
            }
        }
    }

    _handleMouseDown(e) {
        if (this.state.pencilActive) {
            // if a note was clicked on just return, the onClick handler already contains all of the
            // logic for that. 
            if (e.target.attrs.type && e.target.attrs.type === 'noteRect') {
                return;
            }
            // All we do here is update state with the coordinates that the mouseDown event happened
            // at, as the mouseUp event handler will later need to reference these.
            const scrolledX = this.gridLayerRef.current.attrs.x || 0;
            const scrolledY = this.gridLayerRef.current.attrs.y || 0;
            this.setState({
                mouseDownPosX: e.evt.layerX - scrolledX,
                mouseDownPosY: e.evt.layerY - scrolledY
            });
        }
    }

    _handleMouseUp(e) {

        // todo - if the distance drawn (ie from pos x at mouseDown to pos x at mouseUp)
        // is less than the equivalent tick value according to the current quantize value
        // in state, then just use that tick value instead of a value based off of the actual
        // distance drawn. For example, at a quantize value of 8n the smallest notes we can
        // produce are 96 ticks. So if we draw a distance that comes to only 31 ticks after
        // everything has been converted/worked out, we ignore that 31 tick value and just use
        // 96 ticks instead. This ensures that we can never end up producing notes that are 
        // shorter than the current value we are quantizing for. 

        // for ref - 48 ticks = '16n'
        if (this.state.pencilActive) {
            // if a note was clicked on just return, the onClick handler already contains all of the
            // logic for that. 
            if (e.target.attrs.type && e.target.attrs.type === 'noteRect' || e.target.attrs.type === 'scrollRect') {
                return;
            }
            // We have take the information about the mouseDown event from state, and combined with
            // the information about this mouseUp event we have to calculate all of the details for 
            // the note that will be added - pitch, time, duration, _id, x, y, width.
            
            // x pos of cursor when mouseDown occurred
            let downX = this.state.mouseDownPosX;
            // y pos of cursor when mouseDown occurred
            let downY = this.state.mouseDownPosY;
            // x pos of cursor when mouseUp occurred, scrolledX is to account for any potential scrolling
            // of the canvas that has occured.
            let scrolledX = this.gridLayerRef.current.attrs.x || 0;
            let upX = e.evt.layerX - scrolledX;
            // current quantize value in state converted into ticks
            let currQuantizeAsTicks = Tone.Time(this.state.quantize).toTicks();
            // the row 'clicked' during mouseDown, according to the y pos
            let rowClicked = Math.floor(downY / 16);
            // the x pos during mouseDown, 'rolled back' to the last whole quantized unit,
            // based on the current quantize value. Can be used to set the visual x position
            // for the note on the grid.
            let adjustedDownX = downX - (downX%(currQuantizeAsTicks/2));
            // adjustment of the y pos during mouseDown, can be used to set the visual y 
            // position for the note on the grid.
            let adjustedDownY = downY - (downY % 16);
            // x pos during mousedown adjusted to a tick value. Note, this is different from
            // adjustedDownX - that is used for the visual coordinate of the note, whereas this
            // is used for the tick value that the note should start at. 
            let downXAsTicks = Tone.Ticks(adjustedDownX*2-(adjustedDownX*2%currQuantizeAsTicks));
            //let downXAsTicks = Tone.Ticks(downX*2-(downX*2%currQuantizeAsTicks));
            //let upXAsTicks = Tone.Ticks(upX*2-(upX*2%currQuantizeAsTicks));
            // x pos during mouseUp, adjusted to ticks, used to determine note duration.
            let upXAsTicks = Tone.Ticks(upX*2);
            // convert the tick-based downXAsTicks into "0:0:0" format.
            let noteTime = downXAsTicks.toBarsBeatsSixteenths();
            // work out the quantized, tick based length of the note based on the difference between
            // upXAsTicks and downXAsTicks
            let noteDurationAsTicks = Tone.Ticks(upXAsTicks-downXAsTicks).quantize(this.state.quantize);
            // convert the tick-based noteDurationAsTicks into notation format - '8n'.
            let noteDurationAsNotation = Tone.Ticks(noteDurationAsTicks).toNotation();
            
            const noteObject = {
                pitch: this._notesArray[rowClicked],
                time: noteTime,
                duration: noteDurationAsNotation,
                _id: generateId(),
                x: adjustedDownX,
                y: adjustedDownY,
                width: noteDurationAsTicks / 2 
            };
            if (this._isValidNote(noteObject)) {
                this.props.addNote(this.section.id, noteObject);
            }

        }
    }

    ___durationIntToString(durationInt) {
        switch (durationInt) {
            case 1:
                return '16n';
            case 2:
                return '8n';
            case 4:
                return '4n';
            case 8:
                return '2n';
            case 16:
                return '1m';
            default:
                return '16n';
        }
    }

    ___durationStringToInt(durationString) {
        switch (durationString) {
            case '16n':
                return 1;
            case '8n':
                return 2;
            case '4n':
                return 4;
            case '2n':
                return 8;
            case '1m':
                return '16n';
            default:
                return 1;
        }
    }

    /**
     * Given a new note, noteToCheck, check this note against all other notes with the same pitch in this
     * section, if this note overlaps any of those notes then it is invalid and the function returns false,
     * if no such note is found then the new note is valid and the function returns true.
     * @param {Object} noteToCheck - the note object for the new note to check.
     * @returns {Boolean} - true if note is valid, false if note is invalid.
     */
    _isValidNote(noteToCheck) {
        const startOfNoteToCheck = Tone.Time(noteToCheck.time).toTicks();
        const endOfNoteToCheck = startOfNoteToCheck + Tone.Time(noteToCheck.duration).toTicks() - 1;
        for (let currentNote of this.section.notes) {
            if (noteToCheck.pitch === currentNote.pitch) {
                const startOfCurrentNote = Tone.Time(currentNote.time).toTicks();
                const endOfCurrentNote = startOfCurrentNote + Tone.Time(currentNote.duration).toTicks() - 1;
                if (
                    (startOfNoteToCheck >= startOfCurrentNote && startOfNoteToCheck <= endOfCurrentNote) ||
                    (endOfNoteToCheck >= startOfCurrentNote && endOfNoteToCheck <= endOfCurrentNote) ||
                    (startOfCurrentNote >= startOfNoteToCheck && startOfCurrentNote <= endOfNoteToCheck) ||
                    (endOfCurrentNote >= startOfNoteToCheck && endOfCurrentNote <= endOfNoteToCheck)
                ) {
                    // console.log(`
                    //     new note start: ${startOfNoteToCheck}
                    //     new note end: ${endOfNoteToCheck}
                    //     current note start: ${startOfCurrentNote}
                    //     current note end: ${endOfCurrentNote}
                    // `);
                    return false;
                }
            }
        }
        return true;
    }

    updateQuantizeValue(e) {
        this.setState({
            quantize: e.target.value
        });
    }

    updateDurationValue(e) {
        this.setState({
            duration: e.target.value
        });
    }

    updateCursorValue(e) {
        this.setState({
            pencilActive: e.target.value === 'pencil'
        });
    }

    _updateLayerPos(e) {
        this.setState({
            layerPosX: e.target.attrs.x,
            layerPosY: e.target.attrs.y
        });
    }

    _horizontalDragMove(e) {


        // Strategy
        // Work out how far along the horizontal slider is, as a percentage (or rather decimal)
        // of the total range of space it can reside in. 
        // Then, using the .x() method, set the x values for the canvas layers as the negative of
        // the total canvas width multiplied by the decimal previously calculated.
        //
        // Working out how far along the horizontal slider is:
        // total range is this.state.stageWidth - (this.padding * 2) - 100
        // current position within that range is e.target.attrs.x - this.padding
        // to decimal => current position / total range
        //
        // total range for overal canvas is canvasWidth - stageWidth
        //  
        //
        //

        // work out horizontal % delta
        const currentSliderPos = e.target.attrs.x - this.padding;
        const { stageWidth } = this.state; 
        const totalSliderRange = stageWidth - (this.padding * 2) - 100;
        const delta = currentSliderPos / totalSliderRange;

        // update the layers

        const totalCanvasRange = this.canvasWidth - stageWidth + this.padding + 16;
        
        this.gridLayerRef.current.x(-(totalCanvasRange * delta));
        this.noteLayerRef.current.x(-(totalCanvasRange * delta));
        this.gridLayerRef.current.batchDraw();
        this.noteLayerRef.current.batchDraw();
    }

    _verticalDragMove(e) {
        // make necessary calculations
        const currentSliderPos = e.target.attrs.y - this.padding;
        const { stageHeight } = this.state;
        const totalSliderRange = stageHeight - (this.padding * 2) - 100;
        const delta = currentSliderPos / totalSliderRange;

        const canvasHeight = 1728;
        const totalCanvasRange = canvasHeight - stageHeight + this.padding + 16;

        // update the layers
        this.gridLayerRef.current.y(-(totalCanvasRange * delta));
        this.noteLayerRef.current.y(-(totalCanvasRange * delta));
        this.gridLayerRef.current.batchDraw();
        this.noteLayerRef.current.batchDraw();
    }

    closePianoRoll = () => {
        this.props.closeWindow(this.props.id);
    }

    render() {
        const gridLinesArray = this._createGridLinesArray();
        //const currentNotes = this.props.sections[this.props.id].notes;
        if (this.state.showStage) {
        return (
            <div className="piano-roll-container">
                <div className="piano-roll-controls-container">
                    <QuantizeSelect 
                        value={this.state.quantize} 
                        handleChange={this.updateQuantizeValue.bind(this)} 
                    />
                    <DurationSelect 
                        value={this.state.duration}
                        handleChange={this.updateDurationValue.bind(this)}
                    />
                    <CursorSelect 
                        value={this.state.pencilActive ? 'pencil' : 'pointer'}
                        handleChange={this.updateCursorValue.bind(this)}
                    />
                    <button 
                        className="piano-roll-controls__close-button"
                        onClick={this.closePianoRoll}
                    >X</button>
                </div>
                <div className="canvas-container" id="piano-roll-canvas-container">
                    <Stage 
                        container={'piano-roll-canvas-container'}
                        ref={this.stageRef}
                        width={800} 
                        height={600} 
                        onClick={this.handleStageClick}
                        onMouseDown={this.handleMouseDown} 
                        onMouseUp={this.handleMouseUp}
                    >
                        <Layer ref={this.gridLayerRef} >
                            <Rect 
                                x={0}
                                y={0}
                                width={this.canvasWidth}
                                height={1750}
                                fill={'#2c2338'}
                            />
                            {
                                gridLinesArray.map((line, index) => (
                                    <Line 
                                        points={line.points}
                                        listening={false}
                                        stroke={'#d86597'}
                                        strokeWidth={line.strokeWidth}
                                        shadowColor={'#ed90b9'}
                                        shadowBlur={4}
                                        shadowOffsetX={0}
                                        shadowOffsetY={0}
                                        key={index}
                                    />
                                ))
                            }
                        </Layer>
                        <Layer
                            ref={this.noteLayerRef}
                        >
                        {
                            this.section.notes.map((note, index) => (
                                <Rect 
                                    x={note.x}
                                    y={note.y}
                                    width={note.width}
                                    height={16}
                                    stroke={'#d86597'}
                                    strokeWidth={2}
                                    fill={'#ed90b9'}
                                    shadowColor={'#d86597'}
                                    shadowBlur={4}
                                    shadowOffsetX={0}
                                    shadowOffsetY={0}
                                    pitch={note.pitch}
                                    time={note.time}
                                    type={'noteRect'}
                                    key={index}
                                />
                            ))
                        }
                        </Layer>
                        <Layer>
                            <Rect 
                                width={100}
                                height={16}
                                fill={'crimson'}
                                x={this.padding}
                                y={this.state.stageHeight - this.padding - 16}
                                draggable={true}
                                type={'scrollRect'}
                                dragBoundFunc={(pos) => {
                                    const currX = pos.x;
                                    const highBound = this.state.stageWidth - this.padding - 100;
                                    pos.x = Math.min(Math.max(currX, this.padding), highBound);
                                    pos.y = this.state.stageHeight - this.padding - 16;
                                    return pos;
                                }}
                                onDragMove={this.horizontalDragMove}
                            />

                            <Rect 
                                width={16}
                                height={100}
                                fill={'crimson'}
                                y={this.padding}
                                x={this.state.stageWidth - this.padding - 16}
                                draggable={true}
                                type={'scrollRect'}
                                dragBoundFunc={(pos) => {
                                    const currY = pos.y;
                                    const highBound = this.state.stageHeight - this.padding - 100;
                                    pos.y = Math.min(Math.max(currY, this.padding), highBound);
                                    pos.x = this.state.stageWidth - this.padding - 16;
                                    return pos;
                                }}
                                onDragMove={this.verticalDragMove}
                            />
                        </Layer>
                    </Stage>
                </div>
            </div>
        );
        } else {
            return null;
        }
    }

}




const mapStateToProps = state => ({
    //notes: state.sectionInfo.notes
    sections: state.sections
});


export default connect(
    mapStateToProps,
    {
        addNote: ActionCreators.addNote,
        removeNote: ActionCreators.removeNote,
        closeWindow: ActionCreators.closeWindow
    }
)(PianoRoll);