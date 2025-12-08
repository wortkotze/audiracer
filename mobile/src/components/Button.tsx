import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { cn } from '../utils/cn'; // We'll create this utility

interface ButtonProps extends TouchableOpacityProps {
    variant?: 'primary' | 'secondary' | 'outline';
    fullWidth?: boolean;
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    fullWidth = false,
    className = '',
    style,
    ...props
}) => {
    const baseStyle = "py-4 px-6 items-center justify-center rounded transition-transform active:scale-95";

    const variants = {
        primary: "bg-audi-red",
        secondary: "bg-white",
        outline: "border-2 border-white bg-transparent"
    };

    const textVariants = {
        primary: "text-white font-bold uppercase tracking-wider",
        secondary: "text-black font-bold uppercase tracking-wider",
        outline: "text-white font-bold uppercase tracking-wider"
    };

    return (
        <TouchableOpacity
            className={cn(baseStyle, variants[variant], fullWidth ? 'w-full' : '', className)}
            activeOpacity={0.8}
            style={style}
            {...props}
        >
            <Text className={textVariants[variant]}>{children}</Text>
        </TouchableOpacity>
    );
};
