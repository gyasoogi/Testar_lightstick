class GifByteWriter {
    constructor() {
        this.bytes = new Uint8Array(1024);
        this.length = 0;
    }

    write(value) {
        this.ensureCapacity(1);
        this.bytes[this.length] = value;
        this.length += 1;
    }

    writeBytes(values) {
        this.ensureCapacity(values.length);
        this.bytes.set(values, this.length);
        this.length += values.length;
    }

    ensureCapacity(additionalLength) {
        if (this.length + additionalLength > this.bytes.length) {
            let capacity = this.bytes.length;
            while (capacity < this.length + additionalLength) capacity *= 2;
            const expanded = new Uint8Array(capacity);
            expanded.set(this.bytes);
            this.bytes = expanded;
        }
    }

    writeWord(value) {
        this.write(value & 0xff);
        this.write((value >> 8) & 0xff);
    }

    writeString(value) {
        for (const character of value) this.write(character.charCodeAt(0));
    }

    finish() {
        return this.bytes.slice(0, this.length);
    }
}

function encodeLzw(indices) {
    const clearCode = 256;
    const endCode = 257;
    const output = [];
    let bitBuffer = 0;
    let bitCount = 0;
    let codeSize = 9;
    let nextCode = 258;
    let dictionary = new Map();

    const writeCode = (code) => {
        bitBuffer |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            output.push(bitBuffer & 0xff);
            bitBuffer >>>= 8;
            bitCount -= 8;
        }
    };
    const resetDictionary = () => {
        dictionary = new Map();
        codeSize = 9;
        nextCode = 258;
    };

    writeCode(clearCode);
    if (indices.length) {
        let prefix = indices[0];
        for (let index = 1; index < indices.length; index += 1) {
            const value = indices[index];
            const key = prefix * 256 + value;
            const existingCode = dictionary.get(key);
            if (existingCode !== undefined) {
                prefix = existingCode;
                continue;
            }

            writeCode(prefix);
            if (nextCode < 4096) {
                dictionary.set(key, nextCode);
                nextCode += 1;
                if (nextCode > 1 << codeSize && codeSize < 12) codeSize += 1;
            } else {
                writeCode(clearCode);
                resetDictionary();
            }
            prefix = value;
        }
        writeCode(prefix);
    }
    writeCode(endCode);
    if (bitCount) output.push(bitBuffer & 0xff);
    return output;
}

function writeImageData(writer, indices) {
    const compressed = Uint8Array.from(encodeLzw(indices));
    writer.write(8);
    for (let offset = 0; offset < compressed.length; offset += 255) {
        const blockLength = Math.min(255, compressed.length - offset);
        writer.write(blockLength);
        writer.writeBytes(compressed.subarray(offset, offset + blockLength));
    }
    writer.write(0);
}

export function createGifPalette(imageDataFrames) {
    const histogram = new Map();
    for (const imageData of imageDataFrames) {
        const rgba = imageData.data;
        for (let offset = 0; offset < rgba.length; offset += 4) {
            const red = rgba[offset];
            const green = rgba[offset + 1];
            const blue = rgba[offset + 2];
            const key = (red >> 3) << 10 | (green >> 3) << 5 | (blue >> 3);
            let color = histogram.get(key);
            if (!color) {
                color = { red: 0, green: 0, blue: 0, count: 0 };
                histogram.set(key, color);
            }
            color.red += red;
            color.green += green;
            color.blue += blue;
            color.count += 1;
        }
    }

    const colors = [...histogram.values()].map((color) => ({
        ...color,
        red: color.red / color.count,
        green: color.green / color.count,
        blue: color.blue / color.count
    }));
    if (!colors.length) throw new RangeError('GIF 팔레트를 만들 프레임이 없습니다.');

    const boxes = [colors];
    while (boxes.length < 256) {
        let splitIndex = -1;
        let splitScore = -1;
        let splitChannel = 'red';
        for (let index = 0; index < boxes.length; index += 1) {
            const box = boxes[index];
            if (box.length < 2) continue;
            const minimums = [Infinity, Infinity, Infinity];
            const maximums = [-Infinity, -Infinity, -Infinity];
            for (const color of box) {
                minimums[0] = Math.min(minimums[0], color.red);
                minimums[1] = Math.min(minimums[1], color.green);
                minimums[2] = Math.min(minimums[2], color.blue);
                maximums[0] = Math.max(maximums[0], color.red);
                maximums[1] = Math.max(maximums[1], color.green);
                maximums[2] = Math.max(maximums[2], color.blue);
            }
            const ranges = maximums.map((maximum, channel) => maximum - minimums[channel]);
            const channelIndex = ranges.indexOf(Math.max(...ranges));
            const score = ranges[channelIndex] * Math.sqrt(box.reduce((sum, color) => sum + color.count, 0));
            if (score > splitScore) {
                splitIndex = index;
                splitScore = score;
                splitChannel = ['red', 'green', 'blue'][channelIndex];
            }
        }
        if (splitIndex === -1) break;

        const box = boxes[splitIndex].sort((first, second) => first[splitChannel] - second[splitChannel]);
        const totalCount = box.reduce((sum, color) => sum + color.count, 0);
        let accumulatedCount = 0;
        let medianIndex = 0;
        while (medianIndex < box.length - 1 && accumulatedCount < totalCount / 2) {
            accumulatedCount += box[medianIndex].count;
            medianIndex += 1;
        }
        boxes.splice(splitIndex, 1, box.slice(0, medianIndex), box.slice(medianIndex));
    }

    const palette = new Uint8Array(256 * 3);
    const paletteColors = boxes.map((box, paletteIndex) => {
        const totals = box.reduce((sum, color) => ({
            red: sum.red + color.red * color.count,
            green: sum.green + color.green * color.count,
            blue: sum.blue + color.blue * color.count,
            count: sum.count + color.count
        }), { red: 0, green: 0, blue: 0, count: 0 });
        const color = {
            red: totals.red / totals.count,
            green: totals.green / totals.count,
            blue: totals.blue / totals.count
        };
        palette[paletteIndex * 3] = Math.round(color.red);
        palette[paletteIndex * 3 + 1] = Math.round(color.green);
        palette[paletteIndex * 3 + 2] = Math.round(color.blue);
        return color;
    });

    const colorMap = new Uint8Array(1 << 15);
    for (let key = 0; key < colorMap.length; key += 1) {
        const color = histogram.get(key);
        const red = color ? color.red / color.count : ((key >> 10) & 31) * 8 + 3.5;
        const green = color ? color.green / color.count : ((key >> 5) & 31) * 8 + 3.5;
        const blue = color ? color.blue / color.count : (key & 31) * 8 + 3.5;
        let nearestIndex = 0;
        let nearestDistance = Infinity;
        for (let index = 0; index < paletteColors.length; index += 1) {
            const paletteColor = paletteColors[index];
            const redDistance = red - paletteColor.red;
            const greenDistance = green - paletteColor.green;
            const blueDistance = blue - paletteColor.blue;
            const distance = redDistance * redDistance * 0.299
                + greenDistance * greenDistance * 0.587
                + blueDistance * blueDistance * 0.114;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        }
        colorMap[key] = nearestIndex;
    }
    return { palette, colorMap };
}

export function quantizeGifFrame(imageData, colorMap, palette) {
    const { width, height, data } = imageData;
    const indexedPixels = new Uint8Array(width * height);
    const currentErrors = new Float32Array((width + 2) * 3);
    const nextErrors = new Float32Array((width + 2) * 3);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            const rgbaIndex = pixel * 4;
            const errorIndex = (x + 1) * 3;
            const red = Math.max(0, Math.min(255, data[rgbaIndex] + currentErrors[errorIndex]));
            const green = Math.max(0, Math.min(255, data[rgbaIndex + 1] + currentErrors[errorIndex + 1]));
            const blue = Math.max(0, Math.min(255, data[rgbaIndex + 2] + currentErrors[errorIndex + 2]));
            const paletteIndex = colorMap[
                (Math.round(red) >> 3) << 10
                | (Math.round(green) >> 3) << 5
                | (Math.round(blue) >> 3)
            ];
            indexedPixels[pixel] = paletteIndex;
            const paletteOffset = paletteIndex * 3;
            const redError = red - palette[paletteOffset];
            const greenError = green - palette[paletteOffset + 1];
            const blueError = blue - palette[paletteOffset + 2];
            for (let channel = 0; channel < 3; channel += 1) {
                const colorError = channel === 0 ? redError : channel === 1 ? greenError : blueError;
                currentErrors[errorIndex + 3 + channel] += colorError * 7 / 16;
                nextErrors[errorIndex - 3 + channel] += colorError * 3 / 16;
                nextErrors[errorIndex + channel] += colorError * 5 / 16;
                nextErrors[errorIndex + 3 + channel] += colorError / 16;
            }
        }
        currentErrors.set(nextErrors);
        nextErrors.fill(0);
    }
    return indexedPixels;
}

export function encodeGif(width, height, frames, palette, frameDelay = 17) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
        throw new RangeError('GIF 크기가 올바르지 않습니다.');
    }
    if (!frames.length || frames.some((frame) => frame.length !== width * height) || palette.length !== 256 * 3) {
        throw new RangeError('GIF 프레임 크기가 올바르지 않습니다.');
    }

    const writer = new GifByteWriter();
    writer.writeString('GIF89a');
    writer.writeWord(width);
    writer.writeWord(height);
    writer.write(0xf7);
    writer.write(0);
    writer.write(0);
    writer.writeBytes(palette);
    writer.write(0x21);
    writer.write(0xff);
    writer.write(11);
    writer.writeString('NETSCAPE2.0');
    writer.write(3);
    writer.write(1);
    writer.writeWord(0);
    writer.write(0);

    const delay = Math.max(2, Math.round(frameDelay));
    for (const frame of frames) {
        writer.write(0x21);
        writer.write(0xf9);
        writer.write(4);
        writer.write(4);
        writer.writeWord(delay);
        writer.write(0);
        writer.write(0);
        writer.write(0x2c);
        writer.writeWord(0);
        writer.writeWord(0);
        writer.writeWord(width);
        writer.writeWord(height);
        writer.write(0);
        writeImageData(writer, frame);
    }
    writer.write(0x3b);
    return writer.finish();
}
