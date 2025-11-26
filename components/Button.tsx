import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '',
  ...props 
}) => {
  const baseStyle = "uppercase font-bold py-3 px-6 tracking-wider transition-all duration-200 clip-path-slant";
  
  const variants = {
    primary: "bg-audi-red text-white hover:bg-red-700 active:scale-95",
    secondary: "bg-white text-black hover:bg-gray-200 active:scale-95",
    outline: "border-2 border-white text-white hover:bg-white hover:text-black active:scale-95"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 100%, 0% 100%, 0% 100%, 0% 15%)' }} // Slight angled cut for "tech" feel
      {...props}
    >
      {children}
    </button>
  );
};
