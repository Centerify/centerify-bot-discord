package main

import (
	"fmt"
	"os"
	"unsafe"
)

var getConsoleMode = kernel32.NewProc("GetConsoleMode")
var setConsoleMode = kernel32.NewProc("SetConsoleMode")
var getBufferInfo = kernel32.NewProc("GetConsoleScreenBufferInfo")
var getInputCP = kernel32.NewProc("GetConsoleCP")
var setInputCP = kernel32.NewProc("SetConsoleCP")
var getOutputCP = kernel32.NewProc("GetConsoleOutputCP")
var setOutputCP = kernel32.NewProc("SetConsoleOutputCP")

func rawTerminal(input, output *os.File) (func(), error) {
	var inMode, outMode uint32
	ok, _, err := getConsoleMode.Call(input.Fd(), uintptr(unsafe.Pointer(&inMode)))
	if ok == 0 {
		return nil, fmt.Errorf("terminal input mode: %w", err)
	}
	ok, _, err = getConsoleMode.Call(output.Fd(), uintptr(unsafe.Pointer(&outMode)))
	if ok == 0 {
		return nil, fmt.Errorf("terminal output mode: %w", err)
	}
	inputCP, _, _ := getInputCP.Call()
	outputCP, _, _ := getOutputCP.Call()
	restore := func() {
		setConsoleMode.Call(input.Fd(), uintptr(inMode))
		setConsoleMode.Call(output.Fd(), uintptr(outMode))
		setInputCP.Call(inputCP)
		setOutputCP.Call(outputCP)
	}
	ok, _, err = setConsoleMode.Call(input.Fd(), uintptr(inMode&^7|0x200))
	if ok == 0 {
		return nil, err
	}
	ok, _, err = setConsoleMode.Call(output.Fd(), uintptr(outMode|4))
	if ok == 0 {
		restore()
		return nil, err
	}
	setInputCP.Call(65001)
	setOutputCP.Call(65001)
	return restore, nil
}

type consoleCoord struct{ X, Y int16 }
type consoleRect struct{ Left, Top, Right, Bottom int16 }
type consoleInfo struct {
	Size, Cursor consoleCoord
	Attributes   uint16
	Window       consoleRect
	Maximum      consoleCoord
}

func terminalSize(output *os.File) (int, int) {
	var info consoleInfo
	ok, _, _ := getBufferInfo.Call(output.Fd(), uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return 100, 30
	}
	return int(info.Window.Right - info.Window.Left + 1), int(info.Window.Bottom - info.Window.Top + 1)
}
