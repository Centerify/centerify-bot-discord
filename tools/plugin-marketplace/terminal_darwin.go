package main

import (
	"os"
	"syscall"
	"unsafe"
)

func rawTerminal(input, output *os.File) (func(), error) {
	var original syscall.Termios
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, input.Fd(), syscall.TIOCGETA, uintptr(unsafe.Pointer(&original)))
	if errno != 0 {
		return nil, errno
	}
	raw := original
	raw.Iflag &^= syscall.BRKINT | syscall.ICRNL | syscall.INPCK | syscall.ISTRIP | syscall.IXON
	raw.Lflag &^= syscall.ECHO | syscall.ICANON | syscall.IEXTEN | syscall.ISIG
	raw.Cflag |= syscall.CS8
	raw.Cc[syscall.VMIN] = 1
	raw.Cc[syscall.VTIME] = 0
	_, _, errno = syscall.Syscall(syscall.SYS_IOCTL, input.Fd(), syscall.TIOCSETA, uintptr(unsafe.Pointer(&raw)))
	if errno != 0 {
		return nil, errno
	}
	return func() {
		syscall.Syscall(syscall.SYS_IOCTL, input.Fd(), syscall.TIOCSETA, uintptr(unsafe.Pointer(&original)))
	}, nil
}
func terminalSize(output *os.File) (int, int) {
	var size struct{ Rows, Columns, X, Y uint16 }
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, output.Fd(), syscall.TIOCGWINSZ, uintptr(unsafe.Pointer(&size)))
	if errno != 0 || size.Columns == 0 || size.Rows == 0 {
		return 100, 30
	}
	return int(size.Columns), int(size.Rows)
}
